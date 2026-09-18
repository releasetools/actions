import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRelease, UsageError, type Git } from '../src/check-release';

/**
 * A module whose source changed has to record it: a version that moved, and a
 * changelog section carrying that version. Without the first, a client that
 * already has 0.1.0 compares versions, finds the same number, and never
 * fetches the fix. Without the second, the reasoning is gone by the time
 * somebody needs it.
 *
 * `git` is injected, so these describe situations rather than build
 * repositories. The integration test drives a real one.
 */
function fakeGit(situation: {
  changed?: string[];
  versions?: Record<string, string>;
  files?: string[];
  untracked?: string[];
}): Git {
  const changed = situation.changed ?? [];
  const versions = situation.versions ?? {};
  const files = situation.files ?? ['skills/thing.md'];
  const untracked = situation.untracked ?? [];
  return (_cwd, args) => {
    const ok = (stdout: string) => ({ status: 0, stdout, stderr: '' });
    const named = (pathspec: string) => pathspec.split('/').at(-1)!;

    if (args[0] === 'diff') {
      const name = named(args.at(-1)!);
      if (!changed.includes(name)) {
        return ok('');
      }
      return ok(`${files.map((file) => `plugins/${name}/${file}`).join('\n')}\n`);
    }
    if (args[0] === 'ls-files') {
      const name = named(args.at(-1)!);
      if (untracked.length === 0) {
        return ok('');
      }
      return ok(`${untracked.map((file) => `plugins/${name}/${file}`).join('\n')}\n`);
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

  /** A repository on disk, one module per pair, each with a matching changelog. */
  function build(...modules: Array<[string, string]>): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'modules-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'plugins'), { recursive: true });
    for (const [name, version] of modules) {
      write(root, `plugins/${name}/plugin.json`, `${JSON.stringify({ name, version })}\n`);
      write(root, `plugins/${name}/CHANGELOG.md`, `# ${name}\n\n## ${version}\n\nThe first release.\n`);
    }
    return root;
  }

  function write(root: string, relative: string, contents: string): void {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }

  /** What every case below shares: the modules live under plugins/. */
  function check(root: string, options: Partial<Parameters<typeof checkRelease>[0]> = {}) {
    return checkRelease({
      root,
      base: 'origin/main',
      modules: ['plugins/*'],
      manifest: 'plugin.json',
      ...options,
    });
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes when nothing changed', () => {
    const result = check(build(['docket', '0.1.0']), {
      git: fakeGit({ changed: [], versions: { docket: '0.1.0' } }),
    });

    expect(result).toEqual({ errors: [], released: [] });
  });

  it('passes when a changed module was bumped', () => {
    const result = check(build(['docket', '0.2.0']), {
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['plugins/docket 0.1.0 -> 0.2.0']);
  });

  it('catches a changed module whose version stood still', () => {
    const result = check(build(['docket', '0.1.0']), {
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('still 0.1.0');
  });

  it('catches a version that went backwards', () => {
    const result = check(build(['docket', '0.1.0']), {
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.2.0' } }),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('still 0.1.0');
  });

  it('asks nothing of a module that is new', () => {
    const result = check(build(['scaffold', '0.1.0']), {
      git: fakeGit({ changed: ['scaffold'], versions: {} }),
    });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['plugins/scaffold is new, at 0.1.0']);
  });

  it('leaves the other modules alone', () => {
    const result = check(build(['docket', '0.1.0'], ['scaffold', '2.3.4']), {
      git: fakeGit({
        changed: ['scaffold'],
        versions: { docket: '0.1.0', scaffold: '2.3.3' },
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['plugins/scaffold 2.3.3 -> 2.3.4']);
  });

  it('says so when the base ref is not there to compare against', () => {
    const result = check(build(['docket', '0.1.0']), {
      git: () => ({ status: 128, stdout: '', stderr: 'bad revision\n' }),
    });

    expect(result.errors[0]).toContain('cannot compare against origin/main');
  });

  it('catches a bumped module whose changelog never mentions the version', () => {
    const root = build(['docket', '0.2.0']);
    write(root, 'plugins/docket/CHANGELOG.md', '# docket\n\n## 0.1.0\n\nThe first release.\n');

    const result = check(root, {
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.released).toEqual(['plugins/docket 0.1.0 -> 0.2.0']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('no section for 0.2.0');
  });

  it('catches a module with no changelog at all', () => {
    const root = build(['docket', '0.2.0']);
    fs.rmSync(path.join(root, 'plugins/docket/CHANGELOG.md'));

    const result = check(root, {
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('has no CHANGELOG.md');
  });

  it('asks for a changelog entry from a new module too', () => {
    const root = build(['scaffold', '0.1.0']);
    fs.rmSync(path.join(root, 'plugins/scaffold/CHANGELOG.md'));

    const result = check(root, {
      git: fakeGit({ changed: ['scaffold'], versions: {} }),
    });

    expect(result.released).toEqual(['plugins/scaffold is new, at 0.1.0']);
    expect(result.errors).toHaveLength(1);
  });

  it('takes a dated heading, the way release-notes writes one', () => {
    const root = build(['docket', '0.2.0']);
    write(root, 'plugins/docket/CHANGELOG.md', '# docket\n\n## 0.2.0 - 2026-09-11\n\nWhat changed.\n');

    const result = check(root, {
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toEqual([]);
  });

  it('does not read 0.2.0 out of 0.2.0-rc1', () => {
    const root = build(['docket', '0.2.0']);
    write(root, 'plugins/docket/CHANGELOG.md', '# docket\n\n## 0.2.0-rc1\n\nNot the release.\n');

    const result = check(root, {
      git: fakeGit({ changed: ['docket'], versions: { docket: '0.1.0' } }),
    });

    expect(result.errors).toHaveLength(1);
  });

  it('names a manifest it cannot read instead of stopping the run', () => {
    const root = build(['docket', '0.1.0'], ['scaffold', '2.3.4']);
    fs.rmSync(path.join(root, 'plugins/docket/plugin.json'));

    const result = check(root, {
      git: fakeGit({
        changed: ['docket', 'scaffold'],
        versions: { docket: '0.1.0', scaffold: '2.3.3' },
      }),
    });

    expect(result.errors).toEqual(['plugins/docket/plugin.json is not there']);
    expect(result.released).toEqual(['plugins/scaffold 2.3.3 -> 2.3.4']);
  });

  it('refuses a run with no base ref', () => {
    expect(() => check(build(['docket', '0.1.0']), { base: '' })).toThrow(UsageError);
  });
});

describe('which modules get checked', () => {
  const roots: string[] = [];

  function repository(...directories: string[]): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'modules-')));
    roots.push(root);
    for (const directory of directories) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
      fs.writeFileSync(
        path.join(root, directory, 'package.json'),
        `${JSON.stringify({ version: '0.2.0' })}\n`,
      );
      fs.writeFileSync(path.join(root, directory, 'CHANGELOG.md'), '## 0.2.0\n\nWhat changed.\n');
    }
    return root;
  }

  /** Every module looks changed, and every one was at 0.1.0 before. */
  function everythingChanged(): Git {
    return (_cwd, args) => {
      const ok = (stdout: string) => ({ status: 0, stdout, stderr: '' });
      if (args[0] === 'diff') {
        const pathspec = args.at(-1)!;
        return ok(`${pathspec === '.' ? '' : `${pathspec}/`}src/thing.ts\n`);
      }
      if (args[0] === 'ls-files') {
        return ok('');
      }
      if (args[0] === 'show') {
        return ok(JSON.stringify({ version: '0.1.0' }));
      }
      return { status: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
    };
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats the repository itself as the module by default', () => {
    const root = repository('.');

    const result = checkRelease({ root, base: 'origin/main', git: everythingChanged() });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual([`${path.basename(root)} 0.1.0 -> 0.2.0`]);
  });

  it('takes every directory at the top with ./*', () => {
    const root = repository('one', 'two');

    const result = checkRelease({
      root,
      base: 'origin/main',
      modules: ['./*'],
      git: everythingChanged(),
    });

    expect(result.released).toEqual(['one 0.1.0 -> 0.2.0', 'two 0.1.0 -> 0.2.0']);
  });

  it('leaves hidden directories out of a glob', () => {
    const root = repository('one');
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });

    const result = checkRelease({
      root,
      base: 'origin/main',
      modules: ['./*'],
      git: everythingChanged(),
    });

    expect(result.released).toEqual(['one 0.1.0 -> 0.2.0']);
  });

  it('takes a glob one level down, and a plain path', () => {
    const root = repository('packages/web', 'packages/api', 'tools/build');

    const result = checkRelease({
      root,
      base: 'origin/main',
      modules: ['packages/*', 'tools/build'],
      git: everythingChanged(),
    });

    expect(result.released).toEqual([
      'packages/api 0.1.0 -> 0.2.0',
      'packages/web 0.1.0 -> 0.2.0',
      'tools/build 0.1.0 -> 0.2.0',
    ]);
  });

  it('counts a directory named twice once', () => {
    const root = repository('packages/web');

    const result = checkRelease({
      root,
      base: 'origin/main',
      modules: ['packages/*', 'packages/web'],
      git: everythingChanged(),
    });

    expect(result.released).toEqual(['packages/web 0.1.0 -> 0.2.0']);
  });

  it('refuses a pattern that matches no directory', () => {
    const root = repository('one');

    expect(() =>
      checkRelease({ root, base: 'origin/main', modules: ['nowhere/*'], git: everythingChanged() }),
    ).toThrow(/no directory matches nowhere\/\*/);
  });

  it('refuses a run with no modules named', () => {
    const root = repository('one');

    expect(() =>
      checkRelease({ root, base: 'origin/main', modules: [], git: everythingChanged() }),
    ).toThrow(UsageError);
  });
});

describe('which files count as a change', () => {
  const roots: string[] = [];

  function repository(): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'modules-')));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ version: '0.1.0' })}\n`);
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '## 0.1.0\n\nThe first release.\n');
    return root;
  }

  /** The repository is one module, and these are the files that moved in it. */
  function touched(files: string[], untracked: string[] = []): Git {
    return (_cwd, args) => {
      const ok = (stdout: string) => ({ status: 0, stdout, stderr: '' });
      if (args[0] === 'diff') {
        return ok(files.length === 0 ? '' : `${files.join('\n')}\n`);
      }
      if (args[0] === 'ls-files') {
        return ok(untracked.length === 0 ? '' : `${untracked.join('\n')}\n`);
      }
      if (args[0] === 'show') {
        return ok(JSON.stringify({ version: '0.1.0' }));
      }
      return { status: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
    };
  }

  function check(root: string, git: Git, options: Record<string, unknown> = {}) {
    return checkRelease({ root, base: 'origin/main', git, ...options });
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('asks for nothing when only the changelog changed', () => {
    expect(check(repository(), touched(['CHANGELOG.md']))).toEqual({ errors: [], released: [] });
  });

  it('asks for a release when a changelog edit arrives beside real work', () => {
    const result = check(repository(), touched(['CHANGELOG.md', 'src/thing.ts']));

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('still 0.1.0');
  });

  it('ignores a named file at any depth', () => {
    expect(check(repository(), touched(['docs/deep/README.md']))).toEqual({
      errors: [],
      released: [],
    });
  });

  it('ignores case by default, so ReadMe.md is README.md', () => {
    expect(check(repository(), touched(['ReadMe.md']))).toEqual({ errors: [], released: [] });
  });

  it('counts ReadMe.md when the caller asks for case to matter', () => {
    const result = check(repository(), touched(['ReadMe.md']), { caseSensitive: true });

    expect(result.errors).toHaveLength(1);
  });

  it('takes a glob inside a segment', () => {
    expect(
      check(repository(), touched(['notes.md', 'docs/other.md']), { ignoreFiles: ['*.md'] }),
    ).toEqual({ errors: [], released: [] });
  });

  it('takes ** for a whole subtree', () => {
    expect(
      check(repository(), touched(['docs/a/b/page.html']), { ignoreFiles: ['docs/**'] }),
    ).toEqual({ errors: [], released: [] });
  });

  it('anchors a pattern with a slash to the directory it names', () => {
    const result = check(repository(), touched(['other/notes.md']), {
      ignoreFiles: ['docs/notes.md'],
    });

    expect(result.errors).toHaveLength(1);
  });

  it('counts every file when the caller passes no ignores', () => {
    const result = check(repository(), touched(['CHANGELOG.md']), { ignoreFiles: [] });

    expect(result.errors).toHaveLength(1);
  });

  it('sees a file git has never been told about', () => {
    const result = check(repository(), touched([], ['src/brand-new.ts']));

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('still 0.1.0');
  });

  it('says so when git cannot list the new files', () => {
    const result = check(repository(), (_cwd, args) => {
      if (args[0] === 'ls-files') {
        return { status: 128, stdout: '', stderr: 'broken\n' };
      }
      return { status: 0, stdout: 'src/thing.ts\n', stderr: '' };
    });

    expect(result.errors[0]).toContain('cannot list new files');
  });
});
