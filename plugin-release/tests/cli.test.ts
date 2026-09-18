import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type Streams } from '../src/cli';

/**
 * The unit tests stub git. This one drives a real repository, so the diff,
 * the base blob and the exit codes are the ones a maintainer gets from
 * `npm run check:release`.
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

  function plugin(version: string, changelog: string): void {
    write('plugins/docket/.claude-plugin/plugin.json', `${JSON.stringify({ name: 'docket', version })}\n`);
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
    return { code: runCli(['--root', root, ...argv], streams), out, err };
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-')));
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    plugin('0.1.0', '# docket\n\n## 0.1.0\n\nThe first release.\n');
    write('plugins/docket/README.md', '# docket\n');
    base = commit('the plugin as it stands');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes a repository where nothing changed', () => {
    const { code, out, err } = run('--base', base);

    expect(code).toBe(0);
    expect(out).toBe('No plugin changed\n');
    expect(err).toBe('');
  });

  it('fails a plugin edited without a bump', () => {
    write('plugins/docket/README.md', '# docket\n\nA second line.\n');
    commit('edit the plugin');

    const { code, err } = run('--base', base);

    expect(code).toBe(1);
    expect(err).toContain('Release check failed:');
    expect(err).toContain('still 0.1.0');
  });

  it('passes a plugin that declared its release', () => {
    write('plugins/docket/README.md', '# docket\n\nA second line.\n');
    plugin('0.2.0', '# docket\n\n## 0.2.0 - 2026-09-12\n\nA second line.\n\n## 0.1.0\n\nThe first release.\n');
    commit('release 0.2.0');

    const { code, out } = run('--base', base);

    expect(code).toBe(0);
    expect(out).toBe('docket 0.1.0 -> 0.2.0\nEvery changed plugin declared its release\n');
  });

  it('fails a bump whose changelog stayed behind', () => {
    plugin('0.2.0', '# docket\n\n## 0.1.0\n\nThe first release.\n');
    commit('bump and forget');

    const { code, err } = run('--base', base);

    expect(code).toBe(1);
    expect(err).toContain('no section for 0.2.0');
  });

  it('prints usage and exits 2 without a base', () => {
    const { code, err } = run();

    expect(code).toBe(2);
    expect(err).toContain('base is required');
    expect(err).toContain('Usage: plugin-release --base <ref>');
  });

  it('prints usage and exits 2 for a plugins directory that is not there', () => {
    const { code, err } = run('--base', base, '--plugins-dir', 'nowhere');

    expect(code).toBe(2);
    expect(err).toContain('no plugins directory at nowhere');
  });
});
