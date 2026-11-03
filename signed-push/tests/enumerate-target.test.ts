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
  it('returns blob paths, SHAs and modes, ignoring tree entries', async () => {
    const octokit = fakeOctokit(async () => ({
      data: {
        truncated: false,
        tree: [
          { path: 'README.md', type: 'blob', sha: 'aaa', mode: '100644' },
          { path: 'src', type: 'tree', sha: 'bbb', mode: '040000' },
          { path: 'src/index.ts', type: 'blob', sha: 'ccc', mode: '100644' },
          { path: 'run.sh', type: 'blob', sha: 'ddd', mode: '100755' },
        ],
      },
    }));

    const out = await enumerateTarget(octokit, 'owner', 'repo', 'abc123');

    expect(out).toEqual([
      { path: 'README.md', sha: 'aaa', mode: '100644' },
      { path: 'src/index.ts', sha: 'ccc', mode: '100644' },
      { path: 'run.sh', sha: 'ddd', mode: '100755' },
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
          { path: 'ok.md', type: 'blob', sha: 'aaa', mode: '100644' },
          { type: 'blob', sha: 'orphan' }, // no path
          { path: 'noshasum.md', type: 'blob' }, // no sha
        ],
      },
    }));

    const out = await enumerateTarget(octokit, 'owner', 'repo', 'abc');

    expect(out).toEqual([{ path: 'ok.md', sha: 'aaa', mode: '100644' }]);
  });
});
