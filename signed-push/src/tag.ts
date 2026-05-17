import type { GitHub } from '@actions/github/lib/utils';

type Octokit = InstanceType<typeof GitHub>;

/**
 * Creates a lightweight tag at the given commit.
 *
 * If the tag already exists, GitHub returns 422 'Reference already exists'.
 * This function treats that as success: the desired state is already on
 * the server, so re-runs of the workflow do not fail. Other errors propagate.
 */
export async function createTag(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
  commitSha: string,
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
      return;
    }
    throw err;
  }
}
