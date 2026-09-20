import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guardChangelogs } from '../../changelog-guard/src/changelogs';
import { UsageError, guardVersions } from '../src/versions';

/**
 * The unit tests stub git. These drive a real repository, so the fork point,
 * the untracked files, the tags and the commit subjects are the ones a pull
 * request gets. Both guards run against the same tree, because what they are
 * asked separately has to add up to what a release needs.
 */
describe('both guards, against a real repository', () => {
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

  const groups = [
    { path: ['plugins/docket'], manifest: ['plugin.json'], changelog: 'CHANGELOG.md' },
  ];

  function versions(options: Record<string, unknown> = {}) {
    return guardVersions({ root, base, projects: groups, ...options });
  }

  function changelogs(options: Record<string, unknown> = {}) {
    return guardChangelogs({ root, base, projects: groups, ...options });
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'projects-')));
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    project('0.1.0', '# docket\n\n## 0.1.0\n\nThe first release.\n');
    write('plugins/docket/README.md', '# docket\n');
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n');
    write('.gitignore', 'build/\n');
    base = commit('feat(docket): the project as it stands');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes a repository where nothing changed', () => {
    expect(versions()).toEqual({ moved: [], failures: [] });
    expect(changelogs()).toEqual({ recorded: [], failures: [] });
  });

  it('asks a feat for a minor', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    commit('feat(docket): a second line');

    const moved = versions();

    expect(moved.failures).toHaveLength(1);
    expect(moved.failures[0]?.message).toContain('asks for at least 0.2.0 after 0.1.0');
  });

  it('is why both guards ship: the changelog alone passes on last release’s section', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    commit('feat(docket): a second line');

    // The version never moved, so the section written for 0.1.0 still answers
    // the question this guard asks. Only the version guard catches it.
    expect(changelogs().failures).toEqual([]);
    expect(versions().failures).toHaveLength(1);
  });

  it('passes once the version and the changelog both moved', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    project('0.2.0', '# docket\n\n## 0.2.0 - 2026-09-19\n\nA second line.\n\n## 0.1.0\n\nFirst.\n');
    commit('feat(docket): a second line');

    expect(versions().failures).toEqual([]);
    expect(versions().moved).toEqual(['plugins/docket 0.1.0 -> 0.2.0']);
    expect(changelogs().failures).toEqual([]);
    expect(changelogs().recorded).toEqual(['plugins/docket 0.2.0']);
  });

  it('asks nothing of a docs change', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA clearer line.\n');
    commit('docs(docket): say it more clearly');

    expect(versions()).toEqual({ moved: [], failures: [] });
    expect(changelogs().failures).toEqual([]);
  });

  it('sees a project that was never committed', () => {
    write('plugins/scaffold/plugin.json', `${JSON.stringify({ version: '0.1.0' })}\n`);
    write('plugins/scaffold/skills/x.md', '# x\n');

    const projects = [
      ...groups,
      { path: ['plugins/scaffold'], manifest: ['plugin.json'], changelog: 'CHANGELOG.md' },
    ];
    const moved = versions({ projects });
    expect(moved.moved).toContain('plugins/scaffold is new, at 0.1.0');
    expect(changelogs({ projects }).failures[0]?.message).toContain('has no CHANGELOG.md');
  });

  it('checks only declared projects when another directory is added', () => {
    write('plugins/scaffold/plugin.json', `${JSON.stringify({ version: '0.1.0' })}\n`);
    write('plugins/scaffold/skills/x.md', '# x\n');

    expect(versions()).toEqual({ moved: [], failures: [] });
    expect(changelogs()).toEqual({ recorded: [], failures: [] });
  });

  it('passes a changed project with no version alongside a versioned project', () => {
    write('docs/guide.md', '# Guide\n');
    write('plugins/docket/skills/docket/SKILL.md', '# Updated skill\n');
    project('0.1.1', '# docket\n\n## 0.1.1\n\nA fix.\n');
    commit('fix: correct the skill and guide');
    const projects = [...groups, { path: ['docs'] }];

    expect(versions({ projects })).toEqual({
      moved: ['plugins/docket 0.1.0 -> 0.1.1'], failures: [],
    });
    expect(changelogs({ projects })).toEqual({
      recorded: ['plugins/docket 0.1.1'], failures: [],
    });
  });

  it('both guards refuse project patterns', () => {
    const projects = [{ path: ['plugins/*'] }];

    expect(() => versions({ projects })).toThrow(UsageError);
    expect(() => changelogs({ projects })).toThrow(UsageError);
  });

  it('leaves a file git is ignoring out of it', () => {
    write('plugins/docket/build/output.js', 'generated\n');

    expect(versions()).toEqual({ moved: [], failures: [] });
  });

  it('judges the fork point, not the tip a moving base branch has reached', () => {
    write('plugins/scaffold/plugin.json', `${JSON.stringify({ version: '2.0.0' })}\n`);
    write('plugins/scaffold/CHANGELOG.md', '## 2.0.0\n\nThe first release.\n');
    write('plugins/scaffold/skills/x.md', '# x\n');
    commit('feat(scaffold): a second project');

    git('checkout', '-q', '-b', 'work');
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    project('0.2.0', '# docket\n\n## 0.2.0\n\nA second line.\n\n## 0.1.0\n\nFirst.\n');
    commit('feat(docket): release 0.2.0');

    // Somebody else moves main on, under a project this branch never touched.
    git('checkout', '-q', 'main');
    write('plugins/scaffold/skills/y.md', '# y\n');
    write('plugins/scaffold/plugin.json', `${JSON.stringify({ version: '2.1.0' })}\n`);
    write('plugins/scaffold/CHANGELOG.md', '## 2.1.0\n\nMore.\n\n## 2.0.0\n\nFirst.\n');
    commit('feat(scaffold): release 2.1.0');
    git('checkout', '-q', 'work');

    const moved = guardVersions({
      root, base: 'main',
      projects: [{ ...groups[0]!, path: ['plugins/docket', 'plugins/scaffold'] }],
    });

    expect(moved.failures).toEqual([]);
    expect(moved.moved).toEqual(['plugins/docket 0.1.0 -> 0.2.0']);
  });

  it('takes a backport off another line rather than the newest tag by date', () => {
    // One project, tagged the way a repository releasing as one thing tags.
    const single = [{ path: ['./'], manifest: ['package.json'] }];
    write('package.json', `${JSON.stringify({ version: '1.3.5' })}\n`);
    const released = commit('feat: the 1.3 line');
    git('tag', 'v1.3.5');

    git('checkout', '-q', '-b', 'release/1.2', released);
    write('package.json', `${JSON.stringify({ version: '1.2.3' })}\n`);
    commit('fix: a backport');
    git('tag', 'v1.2.3');

    git('checkout', '-q', 'main');
    write('src/thing.ts', 'export const one = 1;\n');
    write('package.json', `${JSON.stringify({ version: '1.3.6' })}\n`);
    commit('fix: the next change on the 1.3 line');

    const moved = guardVersions({ root, base: released, projects: single });

    expect(moved.failures).toEqual([]);
    // v1.2.3 was tagged last, and is not an ancestor of this commit.
    expect(moved.moved).toEqual([`${path.basename(root)} 1.3.5 -> 1.3.6`]);
  });

  it('never takes a floating major tag as a baseline', () => {
    const single = [{ path: ['./'], manifest: ['package.json'] }];
    write('package.json', `${JSON.stringify({ version: '1.3.5' })}\n`);
    const released = commit('feat: the release');
    git('tag', 'v1.3.5');
    // v1 follows the latest release, so it says nothing about what 1.3.5 was.
    git('tag', 'v1');

    write('src/thing.ts', 'export const one = 1;\n');
    write('package.json', `${JSON.stringify({ version: '1.3.6' })}\n`);
    commit('fix: the next change');

    const moved = guardVersions({ root, base: released, projects: single });

    expect(moved.failures).toEqual([]);
    expect(moved.moved).toEqual([`${path.basename(root)} 1.3.5 -> 1.3.6`]);
  });

  it('asks nothing where the repository excepts the convention', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    project('0.2.0', '# docket\n\n## 0.1.0\n\nThe first release.\n');
    commit('feat(docket): a second line');

    expect(changelogs().failures).toHaveLength(1);
    expect(changelogs({ except: ['changelog-per-change'] })).toEqual({
      recorded: [],
      failures: [],
    });
  });

  it('refuses a run with nothing to compare against', () => {
    expect(() => versions({ base: '' })).toThrow(UsageError);
  });
});
