import { describe, expect, it, vi } from 'vitest';
import { createTag } from '../src/tag';

function fakeOctokit(createRefImpl: (...args: unknown[]) => Promise<unknown>): never {
  return {
    rest: { git: { createRef: vi.fn(createRefImpl) } },
  } as never;
}

describe('createTag', () => {
  it('POSTs refs/tags/<tag> at the given commit SHA', async () => {
    let captured: unknown;
    const octokit = fakeOctokit(async (args) => {
      captured = args;
      return { data: {} };
    });

    await createTag(octokit, 'releasetools', 'actions', 'v1.0.0', 'new-sha');

    expect(captured).toEqual({
      owner: 'releasetools',
      repo: 'actions',
      ref: 'refs/tags/v1.0.0',
      sha: 'new-sha',
    });
  });

  it('swallows 422 "Reference already exists" as idempotent success', async () => {
    const err: { status: number; message: string } = {
      status: 422,
      message: 'Reference already exists',
    };
    const octokit = fakeOctokit(async () => {
      throw err;
    });

    await expect(createTag(octokit, 'o', 'r', 'v1', 'sha')).resolves.toBeUndefined();
  });

  it('propagates any other error', async () => {
    const err = { status: 500, message: 'kaboom' };
    const octokit = fakeOctokit(async () => {
      throw err;
    });

    await expect(createTag(octokit, 'o', 'r', 'v1', 'sha')).rejects.toMatchObject({
      status: 500,
    });
  });
});
