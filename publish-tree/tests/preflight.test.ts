import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { flatten, preflight, type PreflightInput } from '../src/preflight';

const SHA = '95f11a3133a8c0e1845ceb0fd05bc752048a42ef';

describe('preflight', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function repository(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-tree-'));
    roots.push(root);
    for (const [name, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(root, name), text);
    }
    return root;
  }

  const CONFIG = 'projects:\n  - path: ./\n    manifest: package.json\n    changelog: CHANGELOG.md\n';
  const CHANGELOG = '# Changelog\n\n## 1.5.2 - 2026-11-04\n\n### Fixed\n\n- A fix.\n\n## 1.5.1 - 2026-11-02\n\n- Older.\n';

  function check(overrides: Partial<PreflightInput> = {}, files: Record<string, string> = {}) {
    const root = repository({
      '.releasetools.yaml': CONFIG,
      'package.json': JSON.stringify({ version: '1.5.2' }),
      'CHANGELOG.md': CHANGELOG,
      ...files,
    });
    return preflight({
      root,
      version: '1.5.2',
      commit: SHA,
      sha: SHA,
      tagExists: false,
      replace: false,
      emptyNotes: 'No user-visible changes.',
      ...overrides,
    });
  }

  it('passes a release whose version, commit, tag and changelog agree', () => {
    const result = check();
    expect(result.failures).toEqual([]);
    expect(result.tag).toBe('v1.5.2');
    expect(result.major).toBe('v1');
    expect(result.notes).toBe('- A fix.');
    expect(result.replacing).toBe(false);
  });

  it('refuses a version with a v, before anything else', () => {
    const result = check({ version: 'v1.5.2' });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/no v, like 1\.5\.2/);
  });

  it('refuses a commit other than the one the run checked out, and takes HEAD', () => {
    expect(check({ sha: '0'.repeat(40) }).failures.join('\n')).toMatch(/asked to publish 95f11a3/);
    expect(check({ commit: 'HEAD', sha: '0'.repeat(40) }).failures).toEqual([]);
  });

  it('refuses a manifest declaring another version', () => {
    const result = check({}, { 'package.json': JSON.stringify({ version: '1.5.1' }) });
    expect(result.failures.join('\n')).toMatch(/package\.json declares 1\.5\.1, not 1\.5\.2/);
  });

  it('refuses without a .releasetools.yaml to say where the version lives', () => {
    const root = repository({ 'package.json': JSON.stringify({ version: '1.5.2' }), 'CHANGELOG.md': CHANGELOG });
    const result = preflight({
      root,
      version: '1.5.2',
      commit: 'HEAD',
      sha: SHA,
      tagExists: false,
      replace: false,
      emptyNotes: '',
    });
    expect(result.failures.join('\n')).toMatch(/\.releasetools\.yaml is missing/);
  });

  it('refuses a tag that exists, and a replacement where tags are immutable', () => {
    expect(check({ tagExists: true }).failures.join('\n')).toMatch(/v1\.5\.2 already exists/);
    expect(check({ tagExists: true, replace: true }).failures.join('\n')).toMatch(/keeps immutable-tag/);
  });

  it('replaces only where the repository excepts immutable-tag and the dispatch asks', () => {
    const files = { '.releasetools.yaml': `${CONFIG}conventions:\n  except: [immutable-tag]\n` };
    const result = check({ tagExists: true, replace: true }, files);
    expect(result.failures).toEqual([]);
    expect(result.replacing).toBe(true);
    expect(check({ tagExists: true }, files).failures.join('\n')).toMatch(/already exists/);
  });

  it('refuses a version the changelog does not describe', () => {
    const result = check({}, { 'CHANGELOG.md': '# Changelog\n\n## 1.5.1 - 2026-11-02\n\n- Older.\n' });
    expect(result.failures.join('\n')).toMatch(/CHANGELOG\.md has no section for 1\.5\.2/);
  });

  it('publishes the configured default for a section with no entries', () => {
    const result = check({}, { 'CHANGELOG.md': '# Changelog\n\n## 1.5.2 - 2026-11-04\n\n## 1.5.1 - 2026-11-02\n\n- Older.\n' });
    expect(result.failures).toEqual([]);
    expect(result.notes).toBe('No user-visible changes.');
  });
});

describe('flatten', () => {
  it('drops the headings that group entries, since a release holds one version', () => {
    expect(flatten('### Added\n\n- One.\n\n### Fixed\n\n- Two.\n')).toBe('- One.\n\n- Two.');
  });
});
