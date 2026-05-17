import type { GitHub } from '@actions/github/lib/utils';

export interface TargetFile {
  /** Forward-slash path relative to repo root. */
  path: string;
  /** Git blob SHA. Useful for SHA-based skip-unchanged checks; not used in v0.0.1. */
  sha: string;
}

type Octokit = InstanceType<typeof GitHub>;

/**
 * Lists every blob path in a target branch via the recursive Trees API.
 *
 * The REST tree endpoint truncates responses around 100,000 entries or 7 MB.
 * Most release-artifact trees are well under that. If a future caller hits
 * truncated=true, this function throws. That beats silently publishing a
 * commit that thought the target was smaller than it actually is.
 */
export async function enumerateTarget(
  octokit: Octokit,
  owner: string,
  repo: string,
  treeSha: string,
): Promise<TargetFile[]> {
  const res = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: 'true',
  });
  if (res.data.truncated) {
    throw new Error(
      `Target tree at ${owner}/${repo}@${treeSha} is truncated (>100k entries or >7 MB). ` +
        `This action does not handle truncated trees; please open an issue if you need this.`,
    );
  }
  return res.data.tree
    .filter((entry) => entry.type === 'blob' && entry.path && entry.sha)
    .map((entry) => ({
      path: entry.path as string,
      sha: entry.sha as string,
    }));
}
