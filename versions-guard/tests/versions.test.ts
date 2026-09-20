import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Git } from '../../lib/src/git';
import { UsageError, guardVersions } from '../src/versions';

/**
 * How far a version has to move follows from what the changes say they are,
 * so these describe a range of changes and a project's declared version, and
 * check the arithmetic between them. `git` is injected; the integration test
 * drives a real repository.
 */
function fakeGit(situation: {
  changed?: string[];
  subjects?: string[];
  was?: string;
  tag?: string;
}): Git {
  const changed = situation.changed ?? ['src/thing.ts'];
  const subjects = situation.subjects ?? [];
  return (_cwd, args) => {
    const ok = (stdout: string) => ({ status: 0, stdout, stderr: '' });
    if (args[0] === 'merge-base') {
      return ok('forkpoint\n');
    }
    if (args[0] === 'diff') {
      return ok(changed.length === 0 ? '' : `${changed.join('\n')}\n`);
    }
    if (args[0] === 'ls-files') {
      return ok('');
    }
    if (args[0] === 'describe') {
      return situation.tag === undefined
        ? { status: 128, stdout: '', stderr: 'no tag' }
        : ok(`${situation.tag}\n`);
    }
    if (args[0] === 'log') {
      const records = subjects.map((subject) => `\x1e0000000\x1f${subject}\x1f`);
      return ok(records.join(''));
    }
    if (args[0] === 'show') {
      return situation.was === undefined
        ? { status: 128, stdout: '', stderr: 'path does not exist' }
        : ok(JSON.stringify({ version: situation.was }));
    }
    return { status: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
  };
}

describe('guardVersions', () => {
  const roots: string[] = [];

  function repository(version: string): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'versions-')));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ version })}\n`);
    return root;
  }

  function check(root: string, git: Git, options: Record<string, unknown> = {}) {
    return guardVersions({
      root,
      base: 'origin/main',
      projects: [{ path: ['./'], manifest: ['package.json'] }],
      git,
      ...options,
    });
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes when nothing changed', () => {
    const result = check(repository('0.1.0'), fakeGit({ changed: [], was: '0.1.0' }));

    expect(result).toEqual({ moved: [], failures: [] });
  });

  it('passes a changed project holding no manifest', () => {
    const root = repository('0.1.0');
    fs.unlinkSync(path.join(root, 'package.json'));

    const result = check(root, fakeGit({ subjects: ['feat: add a guide'] }));

    expect(result).toEqual({ moved: [], failures: [] });
  });

  it('refuses a manifest that exists but declares no version', () => {
    const root = repository('0.1.0');
    fs.writeFileSync(path.join(root, 'package.json'), '{}\n');

    const result = check(root, fakeGit({ subjects: ['fix: one'] }));

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toBe('package.json declares no version');
  });

  it('asks for a patch after a fix, and takes one', () => {
    const result = check(
      repository('0.1.1'),
      fakeGit({ subjects: ['fix: refuse a bad ref'], was: '0.1.0' }),
    );

    expect(result.failures).toEqual([]);
    expect(result.moved).toEqual([`${last(roots)} 0.1.0 -> 0.1.1`]);
  });

  it('asks for a minor after a feat, and refuses a patch', () => {
    const result = check(
      repository('0.1.1'),
      fakeGit({ subjects: ['feat: read Cargo.toml'], was: '0.1.0' }),
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain('asks for at least 0.2.0 after 0.1.0');
    expect(result.failures[0]?.message).toContain('a feat (read Cargo.toml)');
  });

  it('takes the largest increment in the range', () => {
    const result = check(
      repository('0.2.0'),
      fakeGit({ subjects: ['fix: one', 'feat: two', 'docs: three'], was: '0.1.0' }),
    );

    expect(result.failures).toEqual([]);
  });

  it('asks for a minor after a breaking change, below 1.0.0', () => {
    const result = check(
      repository('0.2.0'),
      fakeGit({ subjects: ['feat!: rename the output'], was: '0.1.0' }),
    );

    expect(result.failures).toEqual([]);
  });

  it('asks for a major after a breaking change, at and above 1.0.0', () => {
    const result = check(
      repository('1.3.0'),
      fakeGit({ subjects: ['feat!: rename the output'], was: '1.2.0' }),
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain('asks for at least 2.0.0 after 1.2.0');
    expect(result.failures[0]?.message).toContain('a breaking change');
  });

  it('reads a BREAKING CHANGE footer as breaking', () => {
    const result = check(
      repository('1.3.0'),
      fakeGit({ subjects: ['feat: rename the output\x1fBREAKING CHANGE: use the new one'], was: '1.2.0' }),
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain('at least 2.0.0');
  });

  it('lets a minor already claimed absorb a later patch', () => {
    const result = check(
      repository('0.2.0'),
      fakeGit({ subjects: ['fix: one more'], was: '0.2.0', tag: 'v0.1.0' }),
    );

    expect(result.failures).toEqual([]);
    expect(result.moved).toEqual([`${last(roots)} 0.1.0 -> 0.2.0`]);
  });

  it('asks nothing of a change that observes nothing', () => {
    const result = check(
      repository('0.1.0'),
      fakeGit({ changed: ['README.md'], subjects: ['docs: say more'], was: '0.1.0' }),
    );

    expect(result).toEqual({ moved: [], failures: [] });
  });

  it('asks for a patch when the range says nothing about itself', () => {
    const result = check(repository('0.1.0'), fakeGit({ subjects: [], was: '0.1.0' }));

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain('at least 0.1.1');
  });

  it('prefers a tag over the manifest at the fork point', () => {
    const result = check(
      repository('1.4.0'),
      fakeGit({ subjects: ['feat: one'], was: '0.9.0', tag: 'v1.3.5' }),
    );

    expect(result.failures).toEqual([]);
    expect(result.moved).toEqual([`${last(roots)} 1.3.5 -> 1.4.0`]);
  });

  it('asks nothing of a project that is new', () => {
    const result = check(repository('0.1.0'), fakeGit({ subjects: ['feat: the first'] }));

    expect(result.failures).toEqual([]);
    expect(result.moved).toEqual([`${last(roots)} is new, at 0.1.0`]);
  });

  it('refuses a version that is not a semantic one', () => {
    const result = check(repository('1.0'), fakeGit({ subjects: ['fix: one'], was: '0.9.0' }));

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain('not a semantic version');
  });

  it('asks every manifest a project holds to agree', () => {
    const root = repository('0.2.0');
    fs.writeFileSync(path.join(root, 'VERSION'), '0.3.0\n');

    const result = check(root, fakeGit({ subjects: ['fix: one'], was: '0.1.0' }), {
      projects: [{ path: ['./'], manifest: ['package.json', 'VERSION'] }],
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain('declares 0.2.0 in package.json and 0.3.0');
  });

  it('stops reading types where the repository excepts bump-from-type', () => {
    // A feat would ask for a minor. Excepted, the older rule applies and any
    // material change asks for a patch, which this already reached.
    const result = check(
      repository('0.1.1'),
      fakeGit({ subjects: ['feat: read Cargo.toml'], was: '0.1.0' }),
      { except: ['bump-from-type'] },
    );

    expect(result.failures).toEqual([]);
    expect(result.moved).toEqual([`${last(roots)} 0.1.0 -> 0.1.1`]);
  });

  it('refuses a run with nothing to compare against', () => {
    expect(() => check(repository('0.1.0'), fakeGit({}), { base: '' })).toThrow(UsageError);
  });
});

function last(roots: readonly string[]): string {
  return path.basename(roots[roots.length - 1]!);
}
