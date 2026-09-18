import * as fs from 'node:fs';

/**
 * The label that turns the check off for one pull request.
 *
 * One name rather than an input. A check whose escape hatch is configurable
 * has an escape hatch per repository, and a reviewer looking at a pull request
 * that skipped it would have to read that repository's workflow to learn what
 * the label was called.
 */
export const SKIP_LABEL = 'skip-changelog-guard';

/**
 * Whether this run is a pull request carrying the skip label.
 *
 * The labels are read straight out of the event file rather than through
 * @actions/github, which would bundle Octokit to parse one JSON file the
 * runner already wrote to disk.
 */
export function skipRequested(): boolean {
  return carriesLabel(pullRequestLabels());
}

export function pullRequestLabels(): unknown {
  const file = process.env['GITHUB_EVENT_PATH'];
  if (!file) {
    return undefined;
  }
  try {
    const payload: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (payload as { pull_request?: { labels?: unknown } }).pull_request?.labels;
  } catch {
    // No event file, or one this run cannot read. The check runs.
    return undefined;
  }
}

/**
 * The labels are whatever the event carried: an array of `{ name }` on every
 * current payload, and bare strings are accepted because a hand-built payload
 * in a workflow_call is somebody else's shape.
 */
export function carriesLabel(labels: unknown): boolean {
  return Array.isArray(labels) && labels.some((entry) => nameOf(entry) === SKIP_LABEL);
}

function nameOf(entry: unknown): string | null {
  if (typeof entry === 'string') {
    return entry;
  }
  if (typeof entry === 'object' && entry !== null) {
    const name = (entry as { name?: unknown }).name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}
