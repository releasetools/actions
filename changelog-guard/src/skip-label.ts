import { pullRequest } from './event';

/**
 * The label that turns the check off for one pull request.
 *
 * One name rather than an input. A check whose escape hatch is configurable
 * has an escape hatch per repository, and a reviewer looking at a pull request
 * that skipped it would have to read that repository's workflow to learn what
 * the label was called.
 */
export const SKIP_LABEL = 'skip-changelog-guard';

/** Whether this run is a pull request carrying the skip label. */
export function skipRequested(): boolean {
  return carriesLabel(pullRequest()?.labels);
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
