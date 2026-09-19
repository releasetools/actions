import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FILE, readSettings } from '../src/settings';

/**
 * A repository declares what it holds, and every guard reads the same file.
 * Whatever this gets wrong, both guards get wrong.
 */
describe('readSettings', () => {
  const roots: string[] = [];

  function repository(contents?: string): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'settings-')));
    roots.push(root);
    if (contents !== undefined) {
      fs.writeFileSync(path.join(root, CONFIG_FILE), contents);
    }
    return root;
  }

  function settings(contents: string) {
    return readSettings(repository(contents));
  }

  function projects(contents: string) {
    return settings(contents).projects;
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads a repository that keeps no file as one project at its root', () => {
    expect(readSettings(repository())).toEqual({ except: [] });
  });

  it('names the spelling that would otherwise be read as silence', () => {
    const root = repository();
    fs.writeFileSync(path.join(root, '.releasetools.yml'), 'projects:\n  - path: ./\n');

    expect(() => readSettings(root)).toThrow(/\.releasetools\.yml is not read/);
  });

  it('reads groups of paths, manifests and changelogs', () => {
    expect(
      projects(`
projects:
  - path: packages/*
    manifest: package.json
    changelog: CHANGELOG.md
  - path: crates/*
    manifest: Cargo.toml
`),
    ).toEqual([
      { path: ['packages/*'], manifest: ['package.json'], changelog: 'CHANGELOG.md' },
      { path: ['crates/*'], manifest: ['Cargo.toml'] },
    ]);
  });

  it('takes a list wherever it takes one name', () => {
    expect(
      projects(`
projects:
  - path:
      - packages/*
      - tools/build
    manifest:
      - package.json
      - VERSION
`),
    ).toEqual([{ path: ['packages/*', 'tools/build'], manifest: ['package.json', 'VERSION'] }]);
  });

  it('leaves an entry that names no manifest to the default', () => {
    expect(projects('projects:\n  - path: ./')).toEqual([{ path: ['./'] }]);
  });

  it('reads the command that sets a project version', () => {
    expect(
      projects('projects:\n  - path: ./\n    manifest: pyproject.toml\n    bump: uv version {version}'),
    ).toEqual([{ path: ['./'], manifest: ['pyproject.toml'], bump: 'uv version {version}' }]);
  });

  it('refuses a bump command that never names the version', () => {
    expect(() => projects('projects:\n  - path: ./\n    bump: uv version')).toThrow(
      /must say where the version goes/,
    );
  });

  it('reads the ignores and the case flag', () => {
    expect(settings('ignore-files:\n  - docs/**\n  - "*.md"\ncase-sensitive: true')).toEqual({
      ignoreFiles: ['docs/**', '*.md'],
      caseSensitive: true,
      except: [],
    });
  });

  it('separates an empty ignore list from one nobody wrote', () => {
    // Emptying it is a repository saying every file counts, which is not what
    // saying nothing means.
    expect(settings('ignore-files: []').ignoreFiles).toEqual([]);
    expect(settings('projects:\n  - path: ./').ignoreFiles).toBeUndefined();
  });

  it('reads how a release is cut, and leaves later keys alone', () => {
    const declared = settings(
      'release:\n  branch: main\n  checks: tests.yml\n  publish: publish.yml\n  something-later: x',
    );

    // The guards act on none of it, so a key one of them has never heard of
    // is not a reason to fail a pull request.
    expect(declared).not.toHaveProperty('release');
    expect(() => settings('release:\n  checks: []')).toThrow(/checks must be a name/);
  });

  it('reads the conventions a repository does not follow', () => {
    expect(settings('conventions:\n  except:\n    - bump-from-type').except).toEqual([
      'bump-from-type',
    ]);
  });

  it('leaves the keys other tools read alone', () => {
    expect(settings('release:\n  notes: whatever\nprojects:\n  - path: ./').projects).toEqual([
      { path: ['./'] },
    ]);
  });

  it('reads an empty file as nothing said', () => {
    expect(settings('')).toEqual({ except: [] });
    expect(settings('\n  \n')).toEqual({ except: [] });
  });

  it('refuses projects that are not a list of entries', () => {
    expect(() => projects('projects: packages/*')).toThrow(/must be a list of entries/);
    expect(() => projects('projects:\n  path: packages/*')).toThrow(/must be a list of entries/);
  });

  it('refuses an entry with no path', () => {
    expect(() => projects('projects:\n  - manifest: package.json')).toThrow(
      /projects entry 1 needs a path/,
    );
  });

  it('names the key it does not know, since a typo configures the wrong thing quietly', () => {
    expect(() => projects('projects:\n  - paths: packages/*')).toThrow(/entry 1 has no paths/);
  });

  it('refuses a changelog that is not one name', () => {
    expect(() => projects('projects:\n  - path: ./\n    changelog:\n      - a\n      - b')).toThrow(
      /changelog must be the name of one file/,
    );
  });

  it('refuses a path, a manifest or a changelog that climbs out', () => {
    expect(() => projects('projects:\n  - path: ../elsewhere')).toThrow(/path must be inside/);
    expect(() => projects('projects:\n  - path: ./\n    manifest: ../../etc/passwd')).toThrow(
      /manifest must be inside/,
    );
    expect(() => projects('projects:\n  - path: ./\n    changelog: a/../../b.md')).toThrow(
      /changelog must be inside/,
    );
  });

  it('refuses an absolute path', () => {
    expect(() => projects('projects:\n  - path: /etc')).toThrow(/not an absolute path/);
    expect(() => projects('projects:\n  - path: ./\n    manifest: /etc/passwd')).toThrow(
      /not an absolute path/,
    );
  });

  it('takes a .. that never leaves the name it is in', () => {
    expect(projects('projects:\n  - path: ./\n    manifest: a..b.json')).toEqual([
      { path: ['./'], manifest: ['a..b.json'] },
    ]);
  });

  it('refuses a case flag that is not a flag', () => {
    expect(() => settings('case-sensitive: yes please')).toThrow(/must be true or false/);
  });

  it('refuses the YAML tags that ask for code', () => {
    expect(() => settings('projects:\n  - path: !!js/function "function () {}"')).toThrow(
      /is YAML this does not read/,
    );
  });

  it('says which line YAML broke on', () => {
    expect(() => settings('projects: [unclosed')).toThrow(/line 1: a list opened with \[/);
    expect(() => settings('projects:\n  - path: ./\n\tmanifest: x')).toThrow(
      /line 3: YAML indents with spaces/,
    );
  });
});
