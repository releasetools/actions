import type { GitHub } from '@actions/github/lib/utils';
import type { Repository } from '../../lib/src/repository';
import { sourceCommitOf } from './source-commit';
import { treeDifferences } from './tree-diff';

type Octokit = InstanceType<typeof GitHub>;

const SHA = /^[0-9a-f]{40}$/;

export interface VerifyInput {
  /** The repository signed-push committed to. */
  repository: Repository;
  /** The commit to verify there: a SHA, or a branch or tag naming it. */
  commit: string;
  source: Repository;
  /** The directory of `source` the commit holds, relative to its root. */
  sourcePath: string;
  /** The login that must have authored the commit, such as `my-app[bot]`. */
  publisher: string;
  /** The source commit the caller expects, or empty. */
  sourceCommit: string;
  /** A release tag of `source` that must name the source commit, or empty. */
  tag: string;
  serverUrl: string;
}

export interface Verified {
  commitSha: string;
  sourceCommit: string;
}

/**
 * Refuses a commit unless GitHub signed it for `publisher` and its tree is
 * exactly `sourcePath` of a commit on the source's default branch. Throws the
 * first reason it finds; returns the two commits otherwise.
 */
export async function verify(octokit: Octokit, input: VerifyInput, log: (line: string) => void): Promise<Verified> {
  const path = directoryOf(input.sourcePath);
  if (input.sourceCommit && !SHA.test(input.sourceCommit)) {
    throw new Error(`source-commit must be a full lowercase SHA, got "${input.sourceCommit}"`);
  }

  const published = await signedCommit(octokit, input);
  const sourceCommit = sourceCommitOf(published.message, input.serverUrl, input.source);
  if (input.sourceCommit && input.sourceCommit !== sourceCommit) {
    throw new Error(`source-commit is ${input.sourceCommit}, but the Source-Commit trailer names ${sourceCommit}`);
  }

  // Before any lookup by SHA: GitHub resolves objects across a fork network,
  // so a commit pushed only to a fork would otherwise be found in the source.
  await onDefaultBranch(octokit, input.source, sourceCommit);
  if (input.tag) {
    await releaseTag(octokit, input.source, input.tag, sourceCommit);
  }
  await sameTree(octokit, input, path, sourceCommit, published, log);
  return { commitSha: published.sha, sourceCommit };
}

/** `source-path` the way git names it after a colon: no `./`, no trailing `/`, and empty for the root. */
function directoryOf(value: string): string {
  const path = value.trim().replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (path === '' || path === '.') {
    return '';
  }
  if (path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`source-path must be a directory inside the source repository, got "${value}"`);
  }
  return path;
}

interface Published {
  sha: string;
  tree: string;
  message: string;
}

async function signedCommit(octokit: Octokit, input: VerifyInput): Promise<Published> {
  const { owner, repo } = input.repository;
  const { data } = await octokit.rest.repos.getCommit({ owner, repo, ref: input.commit, per_page: 1 });
  const name = `${owner}/${repo}@${data.sha}`;
  if (!SHA.test(data.sha) || (SHA.test(input.commit) && data.sha !== input.commit)) {
    throw new Error(`GitHub answered ${input.commit} in ${owner}/${repo} with ${data.sha}`);
  }
  const verification = data.commit.verification;
  if (verification?.verified !== true || verification.reason !== 'valid') {
    throw new Error(`${name} carries no verified signature (${verification?.reason ?? 'unsigned'})`);
  }
  // The REST API has no wasSignedByGitHub. GitHub verifies a signature against
  // the committer's keys, and web-flow is the account GitHub signs as, so a
  // verified commit whose committer is web-flow was signed by GitHub.
  if (data.committer?.login !== 'web-flow') {
    throw new Error(`${name} was not signed by GitHub: its committer is ${data.committer?.login ?? 'no GitHub account'}`);
  }
  // GitHub signs for an App only when the request names no author, so the
  // author is the App behind the token that made the commit.
  if (data.author?.login?.toLowerCase() !== input.publisher.toLowerCase()) {
    throw new Error(`${name} was authored by ${data.author?.login ?? 'no GitHub account'}, not ${input.publisher}`);
  }
  return { sha: data.sha, tree: data.commit.tree.sha, message: data.commit.message };
}

async function onDefaultBranch(octokit: Octokit, source: Repository, sha: string): Promise<void> {
  const name = `${source.owner}/${source.repo}`;
  const { data: repository } = await octokit.rest.repos.get({ ...source });
  const branch = repository.default_branch;
  const compared = await notFoundAs(`${sha} is not a commit in ${name}`, () =>
    octokit.rest.repos.compareCommitsWithBasehead({ ...source, basehead: `${sha}...${branch}`, per_page: 1 }),
  );
  const { status, behind_by: behind, merge_base_commit: base } = compared.data;
  if ((status !== 'ahead' && status !== 'identical') || behind !== 0 || base.sha !== sha) {
    throw new Error(`${sha} is not on ${name} ${branch}`);
  }
}

async function releaseTag(octokit: Octokit, source: Repository, tag: string, sha: string): Promise<void> {
  const name = `${source.owner}/${source.repo}`;
  const { data: ref } = await notFoundAs(`${name} has no tag ${tag}`, () =>
    octokit.rest.git.getRef({ ...source, ref: `tags/${tag}` }),
  );
  if (ref.ref !== `refs/tags/${tag}` || ref.object.type !== 'tag') {
    throw new Error(`${tag} in ${name} is not an annotated tag`);
  }
  const { data } = await octokit.rest.git.getTag({ ...source, tag_sha: ref.object.sha });
  if (data.sha !== ref.object.sha || data.tag !== tag) {
    throw new Error(`GitHub answered tag object ${ref.object.sha} with ${data.sha} (${data.tag})`);
  }
  if (data.object.type !== 'commit' || data.object.sha !== sha) {
    throw new Error(`${tag} in ${name} names ${data.object.sha}, not ${sha}`);
  }
  if (data.verification?.verified !== true || data.verification.reason !== 'valid') {
    throw new Error(`${tag} in ${name} carries no verified signature (${data.verification?.reason ?? 'unsigned'})`);
  }
}

/**
 * Git trees are content-addressed, so two equal tree SHAs hold the same paths,
 * bytes, modes and symlinks. Only a mismatch costs the two listings that say
 * where.
 */
async function sameTree(
  octokit: Octokit,
  input: VerifyInput,
  path: string,
  sourceCommit: string,
  published: Published,
  log: (line: string) => void,
): Promise<void> {
  const source = `${input.source.owner}/${input.source.repo}@${sourceCommit}:${path || '.'}`;
  const { data } = await notFoundAs(`${source} is not a directory`, () =>
    octokit.rest.git.getTree({ ...input.source, tree_sha: `${sourceCommit}:${path}` }),
  );
  if (!SHA.test(data.sha)) {
    throw new Error(`GitHub answered ${source} with ${data.sha}`);
  }
  if (data.sha === published.tree) {
    return;
  }
  const [from, to] = await Promise.all([
    octokit.rest.git.getTree({ ...input.source, tree_sha: data.sha, recursive: 'true' }),
    octokit.rest.git.getTree({ ...input.repository, tree_sha: published.tree, recursive: 'true' }),
  ]);
  for (const line of treeDifferences(from.data.tree, to.data.tree)) {
    log(line);
  }
  if (from.data.truncated || to.data.truncated) {
    log('GitHub truncated a tree listing, so the paths above are not all of them.');
  }
  throw new Error(
    `${input.repository.owner}/${input.repository.repo}@${published.sha} does not hold ${source}: ` +
      `its tree is ${published.tree}, and the source's is ${data.sha}`,
  );
}

/** Runs a request, turning GitHub's 404 into `message`. */
async function notFoundAs<T>(message: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      throw new Error(message);
    }
    throw err;
  }
}
