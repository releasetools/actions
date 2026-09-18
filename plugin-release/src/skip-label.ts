import * as fs from 'node:fs';

/**
 * The labels on the pull request this run is about, or undefined on any other
 * event.
 *
 * Read straight out of the event file rather than through @actions/github,
 * which would bundle Octokit to parse one JSON file the runner already wrote
 * to disk.
 */
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
 * Whether a pull request carries the label that turns the check off.
 *
 * The labels come from the webhook payload rather than the API, so this runs
 * on whatever the event carried: an array of `{ name }` on every current
 * payload, and bare strings are accepted because a hand-built payload in a
 * workflow_call is somebody else's shape.
 */
export function carriesLabel(labels: unknown, label: string): boolean {
  if (label.trim() === '' || !Array.isArray(labels)) {
    return false;
  }
  return labels.some((entry) => nameOf(entry) === label);
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
