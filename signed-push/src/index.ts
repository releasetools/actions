import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { enumerateSource } from './enumerate-source';
import { enumerateTarget } from './enumerate-target';
import { commit } from './commit';
import { createTag } from './tag';

export async function run(): Promise<void> {
  try {
    const sourceDir = core.getInput('source-dir', { required: true });
    const targetRepo = core.getInput('target-repo', { required: true });
    const targetBranch = core.getInput('target-branch') || 'main';
    const headline = core.getInput('headline', { required: true });
    const body = core.getInput('body');
    const prune = core.getBooleanInput('prune');
    const tag = core.getInput('tag');
    const token = core.getInput('token', { required: true });

    const slash = targetRepo.indexOf('/');
    if (slash <= 0 || slash === targetRepo.length - 1) {
      throw new Error(`target-repo must be "owner/repo", got "${targetRepo}"`);
    }
    const owner = targetRepo.slice(0, slash);
    const repo = targetRepo.slice(slash + 1);

    const octokit = getOctokit(token);

    const additions = await enumerateSource(sourceDir);
    core.info(`Source: ${additions.length} file(s) under ${sourceDir}`);

    const branchData = await octokit.rest.repos.getBranch({ owner, repo, branch: targetBranch });
    const expectedHeadOid = branchData.data.commit.sha;
    core.info(`Target HEAD ${owner}/${repo}@${targetBranch}: ${expectedHeadOid}`);

    let deletions: Array<{ path: string }> = [];
    if (prune) {
      const targetFiles = await enumerateTarget(octokit, owner, repo, expectedHeadOid);
      const sourcePaths = new Set(additions.map((a) => a.path));
      deletions = targetFiles
        .filter((f) => !sourcePaths.has(f.path))
        .map((f) => ({ path: f.path }));
      core.info(`Prune: ${deletions.length} target file(s) will be deleted`);
    }

    if (additions.length === 0 && deletions.length === 0) {
      core.info('No additions and no deletions. Skipping commit; nothing to apply.');
      core.setOutput('commit-sha', expectedHeadOid);
      core.setOutput(
        'commit-url',
        `https://github.com/${owner}/${repo}/commit/${expectedHeadOid}`,
      );
      return;
    }

    const commitOid = await commit(octokit, {
      owner,
      repo,
      branch: targetBranch,
      expectedHeadOid,
      headline,
      body,
      additions,
      deletions,
    });
    const commitUrl = `https://github.com/${owner}/${repo}/commit/${commitOid}`;
    core.info(`New commit on ${owner}/${repo}@${targetBranch}: ${commitOid}`);
    core.setOutput('commit-sha', commitOid);
    core.setOutput('commit-url', commitUrl);

    if (tag) {
      await createTag(octokit, owner, repo, tag, commitOid);
      core.info(`Tagged ${tag} -> ${commitOid}`);
    }
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
