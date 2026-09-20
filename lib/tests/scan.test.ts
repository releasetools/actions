import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Git } from '../src/git';
import { UsageError, scan } from '../src/scan';

/** The repository itself, which is what most of these describe. */
const ONE = [{ path: ['./'], manifest: ['package.json'] }];

/**
 * Which projects a change touched, and what moved in them. Both guards start
 * here, so what is wrong here is wrong in both.
 */
function fakeGit(files: readonly string[], untracked: readonly string[] = []): Git {
  return (_cwd, args) => {
    const ok = (stdout: string) => ({ status: 0, stdout, stderr: '' });
    if (args[0] === 'merge-base') {
      return ok('forkpoint\n');
    }
    if (args[0] === 'diff') {
      const under = files.filter((file) => within(file, args.at(-1)!));
      return ok(under.length === 0 ? '' : `${under.join('\n')}\n`);
    }
    if (args[0] === 'ls-files') {
      const under = untracked.filter((file) => within(file, args.at(-1)!));
      return ok(under.length === 0 ? '' : `${under.join('\n')}\n`);
    }
    return { status: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
  };
}

function within(file: string, pathspec: string): boolean {
  return pathspec === '.' || file.startsWith(`${pathspec}/`);
}

describe('scan', () => {
  const roots: string[] = [];

  function repository(...directories: string[]): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scan-')));
    roots.push(root);
    for (const directory of directories) {
      const at = path.join(root, directory);
      fs.mkdirSync(at, { recursive: true });
      fs.writeFileSync(path.join(at, 'package.json'), `${JSON.stringify({ version: '0.1.0' })}\n`);
    }
    return root;
  }

  function labels(result: ReturnType<typeof scan>): string[] {
    return result.found.map((one) => one.project.label);
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats the repository itself as the project by default', () => {
    const root = repository('.');

    const result = scan({ root, base: 'main', projects: ONE, git: fakeGit(['src/thing.ts']) });

    expect(labels(result)).toEqual([path.basename(root)]);
    expect(result.found[0]?.material).toBe(true);
  });

  it('checks only the directories named in a list', () => {
    const root = repository('one', 'two');

    const result = scan({
      root,
      base: 'main',
      projects: [{ path: ['one'], manifest: ['package.json'] }],
      git: fakeGit(['one/a.ts', 'two/b.ts']),
    });

    expect(labels(result)).toEqual(['one']);
  });

  it('checks a named hidden directory', () => {
    const root = repository('one');
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });

    const result = scan({
      root,
      base: 'main',
      projects: [{ path: ['.github'], manifest: ['package.json'] }],
      git: fakeGit(['one/a.ts', '.github/workflows/ci.yml']),
    });

    expect(labels(result)).toEqual(['.github']);
  });

  it('checks named directories at different depths in path order', () => {
    const root = repository('packages/web', 'packages/api', 'tools/build');

    const result = scan({
      root,
      base: 'main',
      projects: [{ path: ['packages/web', 'packages/api', 'tools/build'], manifest: ['package.json'] }],
      git: fakeGit(['packages/web/a.ts', 'packages/api/b.ts', 'tools/build/c.ts']),
    });

    expect(labels(result)).toEqual(['packages/api', 'packages/web', 'tools/build']);
  });

  it('gives a directory two groups reach to the first of them', () => {
    const root = repository('packages/web');

    const result = scan({
      root,
      base: 'main',
      projects: [
        { path: ['packages/web'], manifest: ['package.json'], changelog: 'CHANGELOG.md' },
        { path: ['./packages/web/'], manifest: ['Cargo.toml'] },
      ],
      git: fakeGit(['packages/web/a.ts']),
    });

    expect(result.found[0]?.project.changelog).toBe('CHANGELOG.md');
    expect(result.found[0]?.project.manifests).toEqual(['package.json']);
    expect(result.found).toHaveLength(1);
  });

  it('keeps a directory it was told about that declares no version', () => {
    const root = repository('one');
    fs.mkdirSync(path.join(root, 'docs'));

    const result = scan({
      root,
      base: 'main',
      projects: [{ path: ['docs'], manifest: ['package.json'] }],
      git: fakeGit(['docs/guide.md']),
    });

    expect(labels(result)).toEqual(['docs']);
    expect(result.found[0]?.manifests).toEqual([]);
  });

  it.each([
    './*', 'packages/*', 'packages/**', 'packages/a?i', 'packages/[aw]*',
    'packages/[ab]', 'packages/{api,web}', 'packages/@(api|web)',
    'packages/!(api)', 'packages/+(api)', 'nowhere/*',
  ])('refuses the project pattern %s', (pattern) => {
    const root = repository('packages/api', 'packages/web');
    const run = () => scan({
      root, base: 'main', projects: [{ path: [pattern], manifest: ['package.json'] }], git: fakeGit([]),
    });

    expect(run).toThrow(UsageError);
    expect(run).toThrow(`project path ${pattern} must name a directory; patterns are not allowed`);
  });

  it.each(['missing', 'one/package.json'])('refuses a path that is not a directory: %s', (name) => {
    expect(() => scan({
      root: repository('one'), base: 'main', projects: [{ path: [name], manifest: ['package.json'] }], git: fakeGit([]),
    })).toThrow(`project path ${name} is not a directory`);
  });

  it.each(['.', './'])('accepts %s as the repository root', (name) => {
    const root = repository('.');
    const result = scan({
      root, base: 'main', projects: [{ path: [name], manifest: ['package.json'] }], git: fakeGit(['src/thing.ts']),
    });

    expect(labels(result)).toEqual([path.basename(root)]);
    expect(result.found[0]?.project.path).toBe('');
  });

  it('refuses a run with nothing to compare against', () => {
    expect(() => scan({ root: repository('.'), base: '', projects: ONE, git: fakeGit([]) })).toThrow(UsageError);
  });
});

describe('what counts as material', () => {
  const roots: string[] = [];

  function repository(): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scan-')));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ version: '0.1.0' })}\n`);
    return root;
  }

  function material(files: string[], options: Record<string, unknown> = {}): boolean | undefined {
    return scan({ root: repository(), base: 'main', projects: ONE, git: fakeGit(files), ...options }).found[0]
      ?.material;
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('is false when only the files a release writes moved', () => {
    expect(material(['CHANGELOG.md', 'package.json'])).toBe(false);
  });

  it('is true when work arrived beside them', () => {
    expect(material(['CHANGELOG.md', 'src/thing.ts'])).toBe(true);
  });

  it('ignores a named file at any depth', () => {
    expect(material(['docs/deep/README.md'])).toBe(false);
  });

  it('ignores case by default, so ReadMe.md is README.md', () => {
    expect(material(['ReadMe.md'])).toBe(false);
  });

  it('counts ReadMe.md when the caller asks for case to matter', () => {
    expect(material(['ReadMe.md'], { caseSensitive: true })).toBe(true);
  });

  it('takes a glob inside a segment', () => {
    expect(material(['notes.md', 'docs/other.md'], { ignoreFiles: ['*.md'] })).toBe(false);
  });

  it('takes ** for a whole subtree', () => {
    expect(material(['docs/a/b/page.html'], { ignoreFiles: ['docs/**'] })).toBe(false);
  });

  it('takes ? for one character in an ignored filename', () => {
    expect(material(['notes1.md'], { ignoreFiles: ['notes?.md'] })).toBe(false);
    expect(material(['notes12.md'], { ignoreFiles: ['notes?.md'] })).toBe(true);
  });

  it('anchors a pattern with a slash to the directory it names', () => {
    expect(material(['other/notes.md'], { ignoreFiles: ['docs/notes.md'] })).toBe(true);
  });

  it('never counts the files a release writes, whatever the ignores say', () => {
    expect(
      material(['CHANGELOG.md', 'package.json'], {
        ignoreFiles: [],
        projects: [{ path: ['./'], manifest: ['package.json'], changelog: 'CHANGELOG.md' }],
      }),
    ).toBe(false);
  });

  it('counts a changelog the group never named, once the ignores are emptied', () => {
    // CHANGELOG.md is in the default ignores for the project that keeps one
    // without asking for it to be checked. Emptying them takes that away.
    expect(material(['CHANGELOG.md'], { ignoreFiles: [] })).toBe(true);
  });

  it('sees a file git has never been told about', () => {
    const root = repository();
    const result = scan({ root, base: 'main', projects: ONE, git: fakeGit([], ['src/brand-new.ts']) });

    expect(result.found[0]?.material).toBe(true);
  });
});
