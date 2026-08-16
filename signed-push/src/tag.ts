import type { GitHub } from '@actions/github/lib/utils';

type Octokit = InstanceType<typeof GitHub>;

/**
 * Creates a lightweight tag at the given commit.
 *
 * If the tag already exists, GitHub returns 422 'Reference already exists'.
 * Existing tags are left unchanged by default or force-updated when requested.
 * Other errors propagate.
 */
export async function createTag(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
  commitSha: string,
  force = false,
): Promise<void> {
  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/tags/${tag}`,
      sha: commitSha,
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 422 && typeof e.message === 'string' && e.message.includes('Reference already exists')) {
      if (force) {
        await octokit.rest.git.updateRef({
          owner,
          repo,
          ref: `tags/${tag}`,
          sha: commitSha,
          force: true,
        });
      }
      return;
    }
    throw err;
  }
}

/** Creates each requested tag at the same commit, in input order. */
export async function createTags(
  octokit: Octokit,
  owner: string,
  repo: string,
  tags: string[],
  commitSha: string,
  force = false,
  retryDelayMs = 2000,
): Promise<void> {
  for (const tag of tags) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await createTag(octokit, owner, repo, tag, commitSha, force);
        break;
      } catch (err) {
        if (attempt === 2) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
}
