import { describe, expect, it, vi } from 'vitest';
import { createTag, createTags } from '../src/tag';

function fakeOctokit(
  createRefImpl: (...args: unknown[]) => Promise<unknown>,
  updateRefImpl: (...args: unknown[]) => Promise<unknown> = async () => ({ data: {} }),
): never {
  return {
    rest: { git: { createRef: vi.fn(createRefImpl), updateRef: vi.fn(updateRefImpl) } },
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

  it('force-updates an existing tag when requested', async () => {
    const err = { status: 422, message: 'Reference already exists' };
    const updateRef = vi.fn(async () => ({ data: {} }));
    const octokit = fakeOctokit(async () => {
      throw err;
    }, updateRef);

    await createTag(octokit, 'o', 'r', 'v1', 'new-sha', true);

    expect(updateRef).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      ref: 'tags/v1',
      sha: 'new-sha',
      force: true,
    });
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

describe('createTags', () => {
  it('creates every tag at the same commit in input order', async () => {
    const createRef = vi.fn(async (_args: unknown) => ({ data: {} }));
    const octokit = fakeOctokit(createRef);

    await createTags(
      octokit,
      'releasetools',
      'actions',
      ['v1.2.3', 'v1', 'latest'],
      'new-sha',
    );

    expect(createRef.mock.calls.map(([args]) => args)).toEqual([
      { owner: 'releasetools', repo: 'actions', ref: 'refs/tags/v1.2.3', sha: 'new-sha' },
      { owner: 'releasetools', repo: 'actions', ref: 'refs/tags/v1', sha: 'new-sha' },
      { owner: 'releasetools', repo: 'actions', ref: 'refs/tags/latest', sha: 'new-sha' },
    ]);
  });

  it('stops at the first non-idempotent failure', async () => {
    const createRef = vi
      .fn()
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValue({ status: 500, message: 'kaboom' });
    const octokit = fakeOctokit(createRef);

    await expect(
      createTags(octokit, 'o', 'r', ['one', 'two', 'three'], 'sha', false, 0),
    ).rejects.toMatchObject({ status: 500 });
    expect(createRef).toHaveBeenCalledTimes(3);
  });

  it('retries a transient tag error once', async () => {
    const createRef = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, message: 'temporary' })
      .mockResolvedValueOnce({ data: {} });
    const octokit = fakeOctokit(createRef);

    await expect(createTags(octokit, 'o', 'r', ['v1'], 'sha', false, 0)).resolves.toBeUndefined();
    expect(createRef).toHaveBeenCalledTimes(2);
  });
});
