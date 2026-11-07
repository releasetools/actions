import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { parseRepository } from '../../lib/src/repository';
import { verify } from './verify';

export async function run(): Promise<void> {
  try {
    const token = core.getInput('token');
    // Without a token the requests go unauthenticated, which public
    // repositories allow at 60 an hour from one address.
    const octokit = token ? getOctokit(token) : new GitHub();
    const repository = parseRepository('repository', core.getInput('repository', { required: true }));
    const source = parseRepository('source-repository', core.getInput('source-repository', { required: true }));
    const verified = await verify(
      octokit,
      {
        repository,
        commit: core.getInput('commit', { required: true }),
        source,
        sourcePath: core.getInput('source-path', { required: true }),
        publisher: core.getInput('publisher', { required: true }),
        sourceCommit: core.getInput('source-commit'),
        tag: core.getInput('tag'),
        serverUrl: context.serverUrl,
      },
      (line) => core.info(line),
    );
    core.setOutput('commit-sha', verified.commitSha);
    core.setOutput('source-commit', verified.sourceCommit);
    core.info(
      `${repository.owner}/${repository.repo}@${verified.commitSha} holds ` +
        `${source.owner}/${source.repo}@${verified.sourceCommit}:${core.getInput('source-path')}`,
    );
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
