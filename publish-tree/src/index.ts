import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { commit } from '../../signed-push/src/commit';
import { enumerateSource } from '../../signed-push/src/enumerate-source';
import { enumerateTarget } from '../../signed-push/src/enumerate-target';
import { createTag } from '../../signed-push/src/tag';
import { appendWorkflowMetadata } from '../../signed-push/src/workflow-metadata';
import { preflight } from './preflight';

type Octokit = ReturnType<typeof getOctokit>;

export async function run(): Promise<void> {
  try {
    const version = core.getInput('version', { required: true });
    const sourceDir = core.getInput('source-dir', { required: true });
    const replace = core.getBooleanInput('replace');
    const dryRun = core.getBooleanInput('dry-run');
    const octokit = getOctokit(core.getInput('token', { required: true }));
    const { owner, repo } = context.repo;

    const tag = `v${version.trim()}`;
    const existing = await tagCommit(octokit, owner, repo, tag);
    const checked = preflight({
      root: process.cwd(),
      version,
      commit: core.getInput('commit'),
      sha: context.sha,
      tagExists: existing !== null,
      replace,
      emptyNotes: core.getInput('empty-notes'),
    });
    core.setOutput('tag', checked.tag);
    core.setOutput('major', checked.major);
    if (checked.failures.length > 0) {
      for (const failure of checked.failures) {
        core.error(failure);
      }
      core.setFailed(`refused to publish ${checked.tag}; nothing was published.`);
      return;
    }

    const branch = core.getInput('target-branch') || `release/${checked.major}`;
    core.info(`${checked.tag} from ${context.sha} to ${owner}/${repo}@${branch}`);
    core.info(`Release notes:\n${checked.notes}`);
    if (dryRun) {
      core.info('dry-run: every check passed; nothing was committed, tagged or released.');
      return;
    }

    await ensureBranch(octokit, owner, repo, branch);
    const head = await octokit.rest.repos.getBranch({ owner, repo, branch });
    const expectedHeadOid = head.data.commit.sha;
    const additions = await enumerateSource(sourceDir);
    const target = await enumerateTarget(octokit, owner, repo, expectedHeadOid);
    const sourcePaths = new Set(additions.map((file) => file.path));
    const published = await commit(octokit, {
      owner,
      repo,
      branch,
      expectedHeadOid,
      baseTreeSha: head.data.commit.commit.tree.sha,
      headline: `release: ${checked.tag}`,
      body: appendWorkflowMetadata(
        `Source-Commit: <${context.serverUrl}/${owner}/${repo}/commit/${context.sha}>`,
        { serverUrl: context.serverUrl, repository: `${owner}/${repo}`, sha: context.sha, runId: context.runId },
      ),
      additions,
      target,
      deletions: target.filter((file) => !sourcePaths.has(file.path)).map((file) => ({ path: file.path })),
    });
    const url = `${context.serverUrl}/${owner}/${repo}/commit/${published}`;
    core.setOutput('commit-sha', published);
    core.setOutput('commit-url', url);

    // The exact tag moves only when replacing, which preflight allowed only
    // where immutable-tag is excepted. The floating major moves every time.
    await createTag(octokit, owner, repo, checked.tag, published, checked.replacing);
    if (checked.replacing && existing !== null) {
      core.setOutput('replaced', existing);
      core.warning(`${checked.tag} named ${existing} and now names ${published}.`);
    }
    if (core.getBooleanInput('major-tag')) {
      await createTag(octokit, owner, repo, checked.major, published, true);
    }

    const name = core.getInput('release-name') || checked.tag;
    const release = await releaseFor(octokit, owner, repo, checked.tag);
    if (release === null) {
      await octokit.rest.repos.createRelease({ owner, repo, tag_name: checked.tag, name, body: checked.notes });
    } else {
      await octokit.rest.repos.updateRelease({ owner, repo, release_id: release, name, body: checked.notes });
    }
    core.info(`Published ${checked.tag}: ${url}`);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

/** The commit a tag names, or null when there is no such tag. */
async function tagCommit(octokit: Octokit, owner: string, repo: string, tag: string): Promise<string | null> {
  try {
    const ref = await octokit.rest.git.getRef({ owner, repo, ref: `tags/${tag}` });
    if (ref.data.object.type === 'tag') {
      const annotated = await octokit.rest.git.getTag({ owner, repo, tag_sha: ref.data.object.sha });
      return annotated.data.object.sha;
    }
    return ref.data.object.sha;
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * A missing target branch starts as a parentless commit holding one
 * placeholder file. A workflow's own token cannot create a ref or a commit
 * that brings in workflow files, so the branch never starts from main.
 */
async function ensureBranch(octokit: Octokit, owner: string, repo: string, branch: string): Promise<void> {
  try {
    await octokit.rest.repos.getBranch({ owner, repo, branch });
    return;
  } catch (err) {
    if ((err as { status?: number }).status !== 404) {
      throw err;
    }
  }
  const tree = await octokit.rest.git.createTree({
    owner,
    repo,
    tree: [
      {
        path: 'RELEASE_BRANCH',
        mode: '100644',
        type: 'blob',
        content: `${branch} holds the published tree of each release; the next commit replaces this file.\n`,
      },
    ],
  });
  const root = await octokit.rest.git.createCommit({ owner, repo, message: `Start ${branch}`, tree: tree.data.sha, parents: [] });
  await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: root.data.sha });
  core.info(`Created ${branch} at ${root.data.sha}`);
}

/** The id of the release for a tag, or null when there is none. */
async function releaseFor(octokit: Octokit, owner: string, repo: string, tag: string): Promise<number | null> {
  try {
    const release = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag });
    return release.data.id;
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

run();
