import { describe, expect, it, vi } from 'vitest';
import { commit, type CommitInput } from '../src/commit';
import { blobSha } from '../src/enumerate-source';

function fakeOctokit() {
  const git = {
    createBlob: vi.fn(async (_args: unknown) => ({ data: { sha: 'uploaded-blob' } })),
    createTree: vi.fn(async (_args: unknown) => ({ data: { sha: 'new-tree' } })),
    createCommit: vi.fn(async (_args: unknown) => ({ data: { sha: 'new-commit' } })),
    updateRef: vi.fn(async (_args: unknown) => ({ data: {} })),
  };
  return { octokit: { rest: { git } } as never, git };
}

function file(path: string, text: string, mode: '100644' | '100755' = '100644') {
  const buf = Buffer.from(text);
  return { path, contents: buf.toString('base64'), mode, sha: blobSha(buf) };
}

function input(overrides: Partial<CommitInput>): CommitInput {
  return {
    owner: 'releasetools',
    repo: 'cli',
    branch: 'release/v0',
    expectedHeadOid: 'parent-sha',
    baseTreeSha: 'base-tree',
    headline: 'release: v0.4.4',
    body: 'Source-Commit: <x>',
    additions: [],
    target: [],
    deletions: [],
    ...overrides,
  };
}

describe('blobSha', () => {
  it('matches git hash-object', () => {
    expect(blobSha(Buffer.from('alpha\n'))).toBe('4a58007052a65fbc2fc3f910f2855f45a4058e74');
  });
});

describe('commit', () => {
  it('uploads a new file and keeps its executable mode', async () => {
    const { octokit, git } = fakeOctokit();
    const run = file('scripts/run.sh', '#!/bin/sh\n', '100755');

    const sha = await commit(octokit, input({ additions: [run] }));

    expect(sha).toBe('new-commit');
    expect(git.createBlob).toHaveBeenCalledWith({
      owner: 'releasetools',
      repo: 'cli',
      content: run.contents,
      encoding: 'base64',
    });
    expect(git.createTree).toHaveBeenCalledWith({
      owner: 'releasetools',
      repo: 'cli',
      base_tree: 'base-tree',
      tree: [{ path: 'scripts/run.sh', mode: '100755', type: 'blob', sha: 'uploaded-blob' }],
    });
  });

  it('leaves files the branch already holds out of the tree and uploads nothing', async () => {
    const { octokit, git } = fakeOctokit();
    const same = file('README.md', 'same');

    await commit(
      octokit,
      input({ additions: [same], target: [{ path: 'README.md', sha: same.sha, mode: '100644' }] }),
    );

    expect(git.createBlob).not.toHaveBeenCalled();
    expect(git.createTree).not.toHaveBeenCalled();
    expect(git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ tree: 'base-tree', parents: ['parent-sha'] }),
    );
  });

  it('changes only the mode when the contents match', async () => {
    const { octokit, git } = fakeOctokit();
    const run = file('run.sh', 'echo hi\n', '100755');

    await commit(
      octokit,
      input({ additions: [run], target: [{ path: 'run.sh', sha: run.sha, mode: '100644' }] }),
    );

    expect(git.createBlob).not.toHaveBeenCalled();
    expect(git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: [{ path: 'run.sh', mode: '100755', type: 'blob', sha: run.sha }],
      }),
    );
  });

  it('deletes with a null sha', async () => {
    const { octokit, git } = fakeOctokit();

    await commit(octokit, input({ deletions: [{ path: 'old.txt' }] }));

    expect(git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        tree: [{ path: 'old.txt', mode: '100644', type: 'blob', sha: null }],
      }),
    );
  });

  it('names no author, committer or signature, so GitHub signs the commit', async () => {
    const { octokit, git } = fakeOctokit();

    await commit(octokit, input({ additions: [file('a.txt', 'a')] }));

    expect(git.createCommit).toHaveBeenCalledWith({
      owner: 'releasetools',
      repo: 'cli',
      message: 'release: v0.4.4\n\nSource-Commit: <x>',
      tree: 'new-tree',
      parents: ['parent-sha'],
    });
  });

  it('uses the headline alone when there is no body', async () => {
    const { octokit, git } = fakeOctokit();

    await commit(octokit, input({ body: '' }));

    expect(git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'release: v0.4.4' }),
    );
  });

  it('moves the branch only by fast-forward', async () => {
    const { octokit, git } = fakeOctokit();

    await commit(octokit, input({}));

    expect(git.updateRef).toHaveBeenCalledWith({
      owner: 'releasetools',
      repo: 'cli',
      ref: 'heads/release/v0',
      sha: 'new-commit',
      force: false,
    });
  });

  it('fails when the branch moved and the ref update is refused', async () => {
    const { octokit, git } = fakeOctokit();
    git.updateRef.mockRejectedValueOnce(new Error('Update is not a fast forward'));

    await expect(commit(octokit, input({}))).rejects.toThrow(/not a fast forward/);
  });
});
