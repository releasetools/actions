import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type Streams } from '../src/cli';

/**
 * The unit tests stub git. This one drives a real repository, so the diff, the
 * untracked files, the base blob and the exit codes are the ones a maintainer
 * gets from `npm run check:changelog`.
 */
describe('runCli', () => {
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

  function run(...argv: string[]): { code: number; out: string; err: string } {
    let out = '';
    let err = '';
    const streams: Streams = {
      out: (text) => {
        out += text;
      },
      err: (text) => {
        err += text;
      },
    };
    const code = runCli(
      ['--root', root, '--projects', 'plugins/*', '--manifests', 'plugin.json', ...argv],
      streams,
    );
    return { code, out, err };
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
    const { code, out, err } = run('--base', base);

    expect(code).toBe(0);
    expect(out).toBe('No project changed\n');
    expect(err).toBe('');
  });

  it('fails a project edited without a bump', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    commit('edit the project');

    const { code, err } = run('--base', base);

    expect(code).toBe(1);
    expect(err).toContain('Changelog check failed:');
    expect(err).toContain('still 0.1.0');
  });

  it('passes a project that recorded its new version', () => {
    write('plugins/docket/skills/docket/SKILL.md', '# skill\n\nA second line.\n');
    project('0.2.0', '# docket\n\n## 0.2.0 - 2026-09-18\n\nA second line.\n\n## 0.1.0\n\nFirst.\n');
    commit('release 0.2.0');

    const { code, out } = run('--base', base);

    expect(code).toBe(0);
    expect(out).toBe(
      'plugins/docket 0.1.0 -> 0.2.0\nEvery changed project recorded its new version\n',
    );
  });

  it('fails a bump whose changelog stayed behind', () => {
    project('0.2.0', '# docket\n\n## 0.1.0\n\nThe first release.\n');
    commit('bump and forget');

    const { code, err } = run('--base', base);

    expect(code).toBe(1);
    expect(err).toContain('no section for 0.2.0');
  });

  it('sees a file that was never committed', () => {
    write('plugins/docket/skills/docket/new.md', '# a new skill\n');

    const { code, err } = run('--base', base);

    expect(code).toBe(1);
    expect(err).toContain('still 0.1.0');
  });

  it('sees a project that was never committed', () => {
    write('plugins/scaffold/plugin.json', `${JSON.stringify({ version: '0.1.0' })}\n`);
    write('plugins/scaffold/skills/x.md', '# x\n');

    const { code, out, err } = run('--base', base);

    expect(code).toBe(1);
    expect(out).toContain('plugins/scaffold is new, at 0.1.0');
    expect(err).toContain('has no CHANGELOG.md');
  });

  it('leaves a file git is ignoring out of it', () => {
    write('plugins/docket/build/output.js', 'generated\n');

    const { code, out } = run('--base', base);

    expect(code).toBe(0);
    expect(out).toBe('No project changed\n');
  });

  it('asks for nothing when a real commit only touched the README', () => {
    write('plugins/docket/README.md', '# docket\n\nA second line.\n');
    commit('fix a typo in the README');

    const { code, out } = run('--base', base);

    expect(code).toBe(0);
    expect(out).toBe('No project changed\n');
  });

  it('counts the README when the caller passes no ignores', () => {
    write('plugins/docket/README.md', '# docket\n\nA second line.\n');
    commit('fix a typo in the README');

    const { code, err } = run('--base', base, '--ignore-files', '');

    expect(code).toBe(1);
    expect(err).toContain('still 0.1.0');
  });

  it('treats the repository as one project when nothing names any', () => {
    write('package.json', `${JSON.stringify({ version: '0.1.0' })}\n`);
    write('CHANGELOG.md', '## 0.1.0\n\nThe first release.\n');
    const versioned = commit('give the repository a version');
    write('src/thing.ts', 'export const one = 1;\n');

    let err = '';
    const code = runCli(['--root', root, '--base', versioned], {
      out: () => {},
      err: (text) => {
        err += text;
      },
    });

    expect(code).toBe(1);
    expect(err).toContain(`${path.basename(root)} changed but its version is still 0.1.0`);
  });

  it('prints usage and exits 2 with nothing to compare against', () => {
    const { code, err } = run();

    expect(code).toBe(2);
    expect(err).toContain('nothing to compare against');
    expect(err).toContain('Usage: changelog-guard --base <ref>');
  });

  it('prints usage and exits 2 for a pattern that matches nothing', () => {
    const { code, err } = run('--base', base, '--projects', 'nowhere/*');

    expect(code).toBe(2);
    expect(err).toContain('no directory matches nowhere/*');
  });
});
