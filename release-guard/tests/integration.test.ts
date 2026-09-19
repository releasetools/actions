import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guard, UsageError } from '../src/release';

/**
 * The unit tests stub git. These drive a real repository, so the diff, the
 * untracked files and the base blob are the ones a pull request gets.
 */
describe('guard, against a real repository', () => {
  let root: string;
  let base: string;

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  }

  function write(relative: string, contents: string): void {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }

  function project(version: string, changelog: string): void {
    write('plugins/docket/plugin.json', `${JSON.stringify({ name: 'docket', version })}\n`);
    write('plugins/docket/CHANGELOG.md', changelog);
  }

  function commit(message: string): string {
    git('add', '-A');
    git('commit', '-m', message);
    return git('rev-parse', 'HEAD').trim();
  }

  function check(options: Record<string, unknown> = {}) {
    return guard({
      root,
      base,
      projects: [{ path: ['plugins/*'], manifest: ['plugin.json'], changelog: 'CHANGELOG.md' }],
      ...options,
    });
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'projects-')));
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    project('0.1.0', '# docket\n\n## 0.1.0\n\nThe first release.\n');
    write('plugins/docket/README.md', '# docket\n');
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n');
    write('.gitignore', 'build/\n');
    base = commit('the project as it stands');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes a repository where nothing changed', () => {
    expect(check()).toEqual({ errors: [], released: [] });
  });

  it('fails a project edited without a bump', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    commit('edit the project');

    const { errors } = check();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('still 0.1.0');
  });

  it('passes a project that recorded its new version', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    project('0.2.0', '# docket\n\n## 0.2.0 - 2026-09-18\n\nA second line.\n\n## 0.1.0\n\nFirst.\n');
    commit('release 0.2.0');

    const result = check();

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['plugins/docket 0.1.0 -> 0.2.0']);
  });

  it('fails a bump whose changelog stayed behind', () => {
    project('0.2.0', '# docket\n\n## 0.1.0\n\nThe first release.\n');
    commit('bump and forget');

    const { errors } = check();

    expect(errors[0]?.message).toContain('no section for 0.2.0');
  });

  it('sees a file that was never committed', () => {
    write('plugins/docket/skills/docket/new.md', '# a new skill\n');

    const { errors } = check();

    expect(errors[0]?.message).toContain('still 0.1.0');
  });

  it('sees a project that was never committed', () => {
    write('plugins/scaffold/plugin.json', `${JSON.stringify({ version: '0.1.0' })}\n`);
    write('plugins/scaffold/skills/x.md', '# x\n');

    const { released, errors } = check();

    expect(released).toContain('plugins/scaffold is new, at 0.1.0');
    expect(errors[0]?.message).toContain('has no CHANGELOG.md');
  });

  it('leaves a file git is ignoring out of it', () => {
    write('plugins/docket/build/output.js', 'generated\n');

    expect(check()).toEqual({ errors: [], released: [] });
  });

  it('asks for nothing when a real commit only touched the README', () => {
    write('plugins/docket/README.md', '# docket\n\nA second line.\n');
    commit('fix a typo in the README');

    expect(check()).toEqual({ errors: [], released: [] });
  });

  it('counts the README when the caller passes no ignores', () => {
    write('plugins/docket/README.md', '# docket\n\nA second line.\n');
    commit('fix a typo in the README');

    const { errors } = check({ ignoreFiles: [] });

    expect(errors[0]?.message).toContain('still 0.1.0');
  });

  it('treats the repository as one project when nothing names any', () => {
    write('package.json', `${JSON.stringify({ version: '0.1.0' })}\n`);
    write('CHANGELOG.md', '## 0.1.0\n\nThe first release.\n');
    const versioned = commit('give the repository a version');
    write('src/thing.ts', 'export const one = 1;\n');

    const { errors } = guard({ root, base: versioned });

    expect(errors[0]?.message).toContain(`${path.basename(root)} changed but its version is still 0.1.0`);
  });

  it('judges the fork point, not the tip a moving base branch has reached', () => {
    write('plugins/scaffold/plugin.json', `${JSON.stringify({ version: '2.0.0' })}\n`);
    write('plugins/scaffold/CHANGELOG.md', '## 2.0.0\n\nThe first release.\n');
    write('plugins/scaffold/skills/x.md', '# x\n');
    commit('a second project');

    git('checkout', '-q', '-b', 'work');
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    project('0.2.0', '# docket\n\n## 0.2.0\n\nA second line.\n\n## 0.1.0\n\nFirst.\n');
    commit('release docket 0.2.0');

    // Somebody else moves main on, under a project this branch never touched.
    git('checkout', '-q', 'main');
    write('plugins/scaffold/skills/y.md', '# y\n');
    write('plugins/scaffold/plugin.json', `${JSON.stringify({ version: '2.1.0' })}\n`);
    write('plugins/scaffold/CHANGELOG.md', '## 2.1.0\n\nMore.\n\n## 2.0.0\n\nThe first release.\n');
    commit('release scaffold 2.1.0');
    git('checkout', '-q', 'work');

    const result = check({ base: 'main' });

    expect(result.errors).toEqual([]);
    expect(result.released).toEqual(['plugins/docket 0.1.0 -> 0.2.0']);
  });

  it('refuses a run with nothing to compare against', () => {
    expect(() => check({ base: '' })).toThrow(UsageError);
  });

  it('refuses a pattern that matches no directory', () => {
    expect(() => check({ projects: [{ path: ['nowhere/*'] }] })).toThrow(
      /no directory matches nowhere\/\*/,
    );
  });
});
