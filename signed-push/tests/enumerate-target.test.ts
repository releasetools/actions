import { describe, expect, it, vi } from 'vitest';
import { enumerateTarget } from '../src/enumerate-target';

function fakeOctokit(getTreeImpl: () => Promise<unknown>): never {
  return {
    rest: {
      git: {
        getTree: vi.fn(getTreeImpl),
      },
    },
  } as never;
}

describe('enumerateTarget', () => {
  it('returns blob paths and SHAs, ignoring tree entries', async () => {
    const octokit = fakeOctokit(async () => ({
      data: {
        truncated: false,
        tree: [
          { path: 'README.md', type: 'blob', sha: 'aaa' },
          { path: 'src', type: 'tree', sha: 'bbb' },
          { path: 'src/index.ts', type: 'blob', sha: 'ccc' },
          { path: 'package.json', type: 'blob', sha: 'ddd' },
        ],
      },
    }));

    const out = await enumerateTarget(octokit, 'owner', 'repo', 'abc123');

    expect(out).toEqual([
      { path: 'README.md', sha: 'aaa' },
      { path: 'src/index.ts', sha: 'ccc' },
      { path: 'package.json', sha: 'ddd' },
    ]);
  });

  it('throws loudly when the target tree is truncated', async () => {
    const octokit = fakeOctokit(async () => ({
      data: { truncated: true, tree: [] },
    }));

    await expect(enumerateTarget(octokit, 'owner', 'repo', 'abc123')).rejects.toThrow(
      /truncated/,
    );
  });

  it('drops entries with missing path or sha defensively', async () => {
    const octokit = fakeOctokit(async () => ({
      data: {
        truncated: false,
        tree: [
          { path: 'ok.md', type: 'blob', sha: 'aaa' },
          { type: 'blob', sha: 'orphan' }, // no path
          { path: 'noshasum.md', type: 'blob' }, // no sha
        ],
      },
    }));

    const out = await enumerateTarget(octokit, 'owner', 'repo', 'abc');

    expect(out).toEqual([{ path: 'ok.md', sha: 'aaa' }]);
  });
});
