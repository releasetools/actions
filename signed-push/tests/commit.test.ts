import { describe, expect, it, vi } from 'vitest';
import { commit } from '../src/commit';

function fakeOctokit(graphqlImpl: (q: string, vars: unknown) => Promise<unknown>): never {
  return { graphql: vi.fn(graphqlImpl) } as never;
}

describe('commit', () => {
  it('sends a well-formed createCommitOnBranch input and returns the oid', async () => {
    let captured: unknown;
    const octokit = fakeOctokit(async (_q, vars) => {
      captured = vars;
      return { createCommitOnBranch: { commit: { oid: 'new-sha', url: 'https://x' } } };
    });

    const oid = await commit(octokit, {
      owner: 'releasetools',
      repo: 'actions',
      branch: 'main',
      expectedHeadOid: 'parent-sha',
      headline: 'publish: v1.0.0',
      body: 'Source-Commit: x/y@deadbeef',
      additions: [{ path: 'a.txt', contents: 'YWxwaGE=' }],
      deletions: [{ path: 'old.txt' }],
    });

    expect(oid).toBe('new-sha');
    expect(captured).toEqual({
      input: {
        branch: { repositoryNameWithOwner: 'releasetools/actions', branchName: 'main' },
        message: { headline: 'publish: v1.0.0', body: 'Source-Commit: x/y@deadbeef' },
        expectedHeadOid: 'parent-sha',
        fileChanges: {
          additions: [{ path: 'a.txt', contents: 'YWxwaGE=' }],
          deletions: [{ path: 'old.txt' }],
        },
      },
    });
  });

  it('throws when the response is missing a commit oid', async () => {
    const octokit = fakeOctokit(async () => ({ createCommitOnBranch: null }));

    await expect(
      commit(octokit, {
        owner: 'a',
        repo: 'b',
        branch: 'main',
        expectedHeadOid: 'x',
        headline: 'h',
        body: '',
        additions: [],
        deletions: [],
      }),
    ).rejects.toThrow(/no commit oid/);
  });
});
