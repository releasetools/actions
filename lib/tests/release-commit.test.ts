import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareVersions,
  newestReleaseTag,
  parseVersion,
  releaseCommitOf,
  sourceCommitIn,
} from '../../packages/config/releasetools-config';

const SHA = '95f11a3133a8c0e1845ceb0fd05bc752048a42ef';

describe('sourceCommitIn', () => {
  it('reads Source-Commit before Workflow-Commit', () => {
    const message = `release: v1.5.2\n\nSource-Commit: <https://github.com/o/r/commit/${SHA}>\n---\nWorkflow-Commit: <https://github.com/o/r/commit/${'0'.repeat(40)}>\n`;
    expect(sourceCommitIn(message)).toBe(SHA);
  });

  it('reads Workflow-Commit from a tag published before Source-Commit', () => {
    expect(sourceCommitIn(`release: v0.9.2\n\nWorkflow-Commit: <https://github.com/o/r/commit/${SHA}>\n`)).toBe(SHA);
  });

  it('is null where neither trailer names a full SHA', () => {
    expect(sourceCommitIn('release: v1.0.0\n\nSource-Commit: abc1234\n')).toBeNull();
  });
});

describe('newestReleaseTag', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function repository() {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'release-commit-')));
    roots.push(root);
    const git = (...args: string[]) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
      }
      return result.stdout.trim();
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    const commit = (message: string, file = 'a.txt') => {
      fs.writeFileSync(path.join(root, file), `${message}\n`);
      git('add', '-A');
      git('commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD');
    };
    const built = (tag: string, message: string) => {
      git('checkout', '-q', '--orphan', `release/${tag}`);
      git('rm', '-rq', '--cached', '.');
      fs.writeFileSync(path.join(root, 'dist.js'), `${tag}\n`);
      git('add', 'dist.js');
      git('commit', '-q', '-m', message);
      git('tag', tag);
      git('checkout', '-q', '-f', 'main');
    };
    const run = (args: string[]) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      return { status: result.status ?? 1, stdout: result.stdout };
    };
    return { git, commit, built, run };
  }

  it('is null with no version tag at all', () => {
    const repo = repository();
    repo.commit('first');
    repo.git('tag', 'release-2026');
    expect(newestReleaseTag(repo.run)).toBeNull();
  });

  it('takes a tag the branch holds, and passes over a floating major', () => {
    const repo = repository();
    repo.commit('released');
    repo.git('tag', 'v0.1.0');
    repo.git('tag', 'v0');
    repo.commit('since');
    expect(newestReleaseTag(repo.run)).toEqual({ tag: 'v0.1.0', commit: 'v0.1.0', skipped: [] });
  });

  it('reaches a tag on a built tree through its trailer, past an older tag on main', () => {
    const repo = repository();
    repo.commit('old release');
    repo.git('tag', 'v1.1.0');
    const source = repo.commit('the 1.5.1 release');
    repo.built('v1.5.1', `release: v1.5.1\n\nSource-Commit: <https://github.com/o/r/commit/${source}>`);
    repo.commit('since');
    expect(newestReleaseTag(repo.run)).toEqual({ tag: 'v1.5.1', commit: source, skipped: [] });
    expect(releaseCommitOf(repo.run, 'v1.5.1')).toBe(source);
  });

  it('passes over a newer release on another line, and lists it', () => {
    const repo = repository();
    const released = repo.commit('released');
    repo.git('tag', 'v0.1.0');
    repo.git('checkout', '-q', '-b', 'stable', released);
    repo.commit('backport', 'b.txt');
    repo.git('tag', 'v0.9.0');
    repo.git('checkout', '-q', 'main');
    repo.commit('since');
    expect(newestReleaseTag(repo.run)).toEqual({ tag: 'v0.1.0', commit: 'v0.1.0', skipped: ['v0.9.0'] });
  });

  it('answers no tag rather than guessing when none leads back here', () => {
    const repo = repository();
    repo.commit('first');
    repo.built('v1.0.0', 'release: v1.0.0');
    expect(newestReleaseTag(repo.run)).toEqual({ tag: null, commit: null, skipped: ['v1.0.0'] });
  });

  it('takes the newest pre-release by semantic version, not by name', () => {
    const repo = repository();
    repo.commit('first');
    repo.git('tag', 'v1.0.0-rc.2');
    repo.git('tag', 'v1.0.0-rc.10');
    repo.git('tag', 'v1.0.0-rc2');
    repo.git('tag', 'v1.0.0-rc10');
    // rc.10 follows rc.2 (numeric identifiers); rc10 precedes rc2 (text), and
    // both undotted ones follow the dotted ones ('rc2' > 'rc' after 'rc' matched).
    expect(newestReleaseTag(repo.run)?.tag).toBe('v1.0.0-rc2');
  });

  it('orders a pre-release before the release it names', () => {
    const repo = repository();
    repo.commit('candidate');
    repo.git('tag', 'v1.0.0-rc.2');
    repo.commit('release');
    repo.git('tag', 'v1.0.0');
    repo.commit('since');
    expect(newestReleaseTag(repo.run)?.tag).toBe('v1.0.0');
  });
});

describe('compareVersions', () => {
  const order = (left: string, right: string) => Math.sign(compareVersions(parseVersion(left)!, parseVersion(right)!));

  it('puts a release after its pre-releases, and pre-releases in semver order', () => {
    expect(order('1.0.0', '1.0.0-rc2')).toBe(1);
    expect(order('1.0.0-rc2', '1.0.0-rc1')).toBe(1);
    expect(order('1.0.0-rc.10', '1.0.0-rc.2')).toBe(1);
    expect(order('1.0.0-rc10', '1.0.0-rc2')).toBe(-1);
    expect(order('v1.0.0+build.5', '1.0.0')).toBe(0);
  });
});
