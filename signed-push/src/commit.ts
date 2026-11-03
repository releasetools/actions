import type { GitHub } from '@actions/github/lib/utils';
import type { Addition } from './enumerate-source';
import type { TargetFile } from './enumerate-target';

type Octokit = InstanceType<typeof GitHub>;

export interface CommitInput {
  owner: string;
  repo: string;
  branch: string;
  expectedHeadOid: string;
  /** The tree of expectedHeadOid, which the new tree is built on. */
  baseTreeSha: string;
  headline: string;
  body: string;
  additions: Addition[];
  /** Every blob on the branch, so unchanged files are neither uploaded nor rewritten. */
  target: TargetFile[];
  deletions: Array<{ path: string }>;
}

interface TreeEntry {
  path: string;
  mode: '100644' | '100755';
  type: 'blob';
  sha: string | null;
}

/**
 * Commits through the Git Database API: a blob for each file whose contents the
 * branch does not already hold, a tree on top of the branch's tree, a commit,
 * then a fast-forward-only ref update. Returns the new commit's SHA.
 *
 * GitHub signs a commit created this way when the token belongs to a GitHub App
 * or is GITHUB_TOKEN and the request names no author, committer or signature,
 * so it names none. createCommitOnBranch is not used: its FileAddition has no
 * mode, so every file it writes is 100644 and executable scripts stop running.
 *
 * Unchanged files are skipped to stay under GitHub's limit on content-creating
 * requests, which one blob per file would pass on a tree of a hundred files.
 *
 * The ref update refuses anything but a fast-forward. If something else pushed
 * after expectedHeadOid was read, that commit is no longer an ancestor of ours
 * and the update fails loudly instead of overwriting it.
 */
export async function commit(octokit: Octokit, input: CommitInput): Promise<string> {
  const { owner, repo } = input;
  const existing = new Map(input.target.map((f) => [f.path, f]));

  const entries: TreeEntry[] = [];
  for (const file of input.additions) {
    const current = existing.get(file.path);
    if (current && current.sha === file.sha && current.mode === file.mode) {
      continue;
    }
    let sha = file.sha;
    if (!current || current.sha !== file.sha) {
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: file.contents,
        encoding: 'base64',
      });
      sha = blob.data.sha;
    }
    entries.push({ path: file.path, mode: file.mode, type: 'blob', sha });
  }
  for (const file of input.deletions) {
    entries.push({ path: file.path, mode: '100644', type: 'blob', sha: null });
  }

  let treeSha = input.baseTreeSha;
  if (entries.length > 0) {
    const tree = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: input.baseTreeSha,
      tree: entries,
    });
    treeSha = tree.data.sha;
  }

  const message = input.body ? `${input.headline}\n\n${input.body}` : input.headline;
  const created = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: treeSha,
    parents: [input.expectedHeadOid],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${input.branch}`,
    sha: created.data.sha,
    force: false,
  });

  return created.data.sha;
}
