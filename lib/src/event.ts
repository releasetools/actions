import * as fs from 'node:fs';

/** The pull request this run is about, or undefined on any other event. */
export interface PullRequest {
  labels?: unknown;
  base?: { sha?: unknown };
}

/**
 * Reads the pull request out of the event file the runner wrote.
 *
 * Straight off disk rather than through @actions/github, which would bundle
 * Octokit to parse one JSON file that is already there, and would turn two
 * fields the payload carries into two API calls.
 */
export function pullRequest(): PullRequest | undefined {
  const file = process.env['GITHUB_EVENT_PATH'];
  if (!file) {
    return undefined;
  }
  try {
    const payload: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const found = (payload as { pull_request?: unknown }).pull_request;
    return typeof found === 'object' && found !== null ? (found as PullRequest) : undefined;
  } catch {
    // No event file, or one this run cannot read. The check runs.
    return undefined;
  }
}

/** The commit the pull request is against, or undefined outside one. */
export function baseSha(): string | undefined {
  const sha = pullRequest()?.base?.sha;
  return typeof sha === 'string' && sha.trim() !== '' ? sha : undefined;
}
