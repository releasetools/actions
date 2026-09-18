import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRelease, UsageError, type Git } from '../src/check-release';

/**
 * A plugin that changed declares its release: a version that moved, and a
 * changelog section carrying it. Without the first, a client that already has
 * 0.1.0 compares versions, finds the same number, and never fetches the fix.
 * Without the second, the reasoning is gone by the time somebody needs it.
 *
 * `git` is injected, so these describe situations rather than build
 * repositories. The integration test drives a real one.
 */
function fakeGit(situation: { changed?: string[]; versions?: Record<string, string> }): Git {
  const changed = situation.changed ?? [];
  const versions = situation.versions ?? {};
  return (_cwd, args) => {
    const ok = (stdout: string) => ({ status: 0, stdout, stderr: '' });
    if (args[0] === 'diff') {
      const name = args.at(-1)!.split('/').at(-1)!;
      return ok(changed.includes(name) ? `plugins/${name}/README.md\n` : '');
    }
    if (args[0] === 'show') {
      const name = args[1]!.split(':')[1]!.split('/')[1]!;
      if (!Object.hasOwn(versions, name)) {
        return { status: 128, stdout: '', stderr: 'path does not exist' };
      }
      return ok(JSON.stringify({ name, version: versions[name] }));
    }
    return { status: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
  };
}

describe('checkRelease', () => {
  const roots: string[] = [];

  /** A repository on disk, one plugin per pair, each with a matching changelog. */
  function build(...plugins: Array<[string, string]>): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'plugins'), { recursive: true });
    for (const [name, version] of plugins) {
      write(root, `plugins/${name}/.claude-plugin/plugin.json`, `${JSON.stringify({ name, version })}\n`);
      write(root, `plugins/${name}/CHANGELOG.md`, `# ${name}\n\n## ${version}\n\nThe first release.\n`);
    }
    return root;
  }

  function write(root: string, relative: string, contents: string): void {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes when nothing changed', () => {
    const result = checkRelease({
      root: build(['docket', '0.1.0']),
      base: 'origin/main',
      git: fakeGit({ changed: [], versions: { docket: '0.1.0' } }),
    });

    expect(result).toEqual({ errors: [], released: [] });
  });

  it('passes when a changed plugin was bumped', () => {
    const result = checkRelease({
      root: build(['docket', '0.2.0']),
      base: 'origin/main',
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['docket 0.1.0 -> 0.2.0']);
  });

  it('catches a changed plugin whose version stood still', () => {
    const result = checkRelease({
      root: build(['docket', '0.1.0']),
      base: 'origin/main',
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('still 0.1.0');
  });

  it('catches a version that went backwards', () => {
    const result = checkRelease({
      root: build(['docket', '0.1.0']),
      base: 'origin/main',
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.2.0' } }),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('still 0.1.0');
  });

  it('asks nothing of a plugin that is new', () => {
    const result = checkRelease({
      root: build(['scaffold', '0.1.0']),
      base: 'origin/main',
      git: fakeGit({ changed: ['scaffold'], versions: {} }),
    });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['scaffold is new, at 0.1.0']);
  });

  it('leaves the other plugins alone', () => {
    const result = checkRelease({
      root: build(['docket', '0.1.0'], ['scaffold', '2.3.4']),
      base: 'origin/main',
      git: fakeGit({
        changed: ['scaffold'],
        versions: { docket: '0.1.0', scaffold: '2.3.3' },
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['scaffold 2.3.3 -> 2.3.4']);
  });

  it('says so when the base ref is not there to compare against', () => {
    const result = checkRelease({
      root: build(['docket', '0.1.0']),
      base: 'origin/main',
      git: () => ({ status: 128, stdout: '', stderr: 'bad revision\n' }),
    });

    expect(result.errors[0]).toContain('cannot compare against origin/main');
  });

  it('catches a bumped plugin whose changelog never mentions the version', () => {
    const root = build(['docket', '0.2.0']);
    write(root, 'plugins/docket/CHANGELOG.md', '# docket\n\n## 0.1.0\n\nThe first release.\n');

    const result = checkRelease({
      root,
      base: 'origin/main',
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.released).toEqual(['docket 0.1.0 -> 0.2.0']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('no section for 0.2.0');
  });

  it('catches a plugin with no changelog at all', () => {
    const root = build(['docket', '0.2.0']);
    fs.rmSync(path.join(root, 'plugins/docket/CHANGELOG.md'));

    const result = checkRelease({
      root,
      base: 'origin/main',
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('has no CHANGELOG.md');
  });

  it('asks for a changelog entry from a new plugin too', () => {
    const root = build(['scaffold', '0.1.0']);
    fs.rmSync(path.join(root, 'plugins/scaffold/CHANGELOG.md'));

    const result = checkRelease({
      root,
      base: 'origin/main',
      git: fakeGit({ changed: ['scaffold'], versions: {} }),
    });

    expect(result.released).toEqual(['scaffold is new, at 0.1.0']);
    expect(result.errors).toHaveLength(1);
  });

  it('takes a dated heading, the way release-notes writes one', () => {
    const root = build(['docket', '0.2.0']);
    write(root, 'plugins/docket/CHANGELOG.md', '# docket\n\n## 0.2.0 - 2026-09-11\n\nWhat changed.\n');

    const result = checkRelease({
      root,
      base: 'origin/main',
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toEqual([]);
  });

  it('does not read 0.2.0 out of 0.2.0-rc1', () => {
    const root = build(['docket', '0.2.0']);
    write(root, 'plugins/docket/CHANGELOG.md', '# docket\n\n## 0.2.0-rc1\n\nNot the release.\n');

    const result = checkRelease({
      root,
      base: 'origin/main',
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toHaveLength(1);
  });

  it('reads the manifest and the changelog from where the caller says', () => {
    const root = build();
    write(root, 'extensions/docket/manifest.json', '{"version":"0.2.0"}\n');
    write(root, 'extensions/docket/HISTORY.md', '## 0.2.0\n\nWhat changed.\n');

    const result = checkRelease({
      root,
      base: 'origin/main',
      pluginsDir: 'extensions',
      manifest: 'manifest.json',
      changelog: 'HISTORY.md',
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['docket 0.1.0 -> 0.2.0']);
  });

  it('names a manifest it cannot read instead of stopping the run', () => {
    const root = build(['docket', '0.1.0'], ['scaffold', '2.3.4']);
    fs.rmSync(path.join(root, 'plugins/docket/.claude-plugin/plugin.json'));

    const result = checkRelease({
      root,
      base: 'origin/main',
      git: fakeGit({
        changed: ['docket', 'scaffold'],
        versions: { docket: '0.1.0', scaffold: '2.3.3' },
      }),
    });

    expect(result.errors).toEqual([
      'plugins/docket/.claude-plugin/plugin.json is not there',
    ]);
    expect(result.released).toEqual(['scaffold 2.3.3 -> 2.3.4']);
  });

  it('refuses a run with no base ref', () => {
    expect(() => checkRelease({ root: build(['docket', '0.1.0']), base: '' })).toThrow(UsageError);
  });

  it('refuses a plugins directory that is not there', () => {
    const root = build(['docket', '0.1.0']);

    expect(() => checkRelease({ root, base: 'origin/main', pluginsDir: 'nowhere' })).toThrow(
      /no plugins directory at nowhere/,
    );
  });
});
