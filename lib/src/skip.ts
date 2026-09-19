import { pullRequest } from './event';

/**
 * Whether a pull request carries the label that turns one guard off.
 *
 * One fixed name per guard rather than an input. A configurable escape hatch
 * is a different escape hatch in every repository, and a reviewer looking at a
 * pull request that skipped a check would have to read that repository's
 * workflow to learn what the label was called.
 */
export function skipRequested(label: string): boolean {
  const labels = pullRequest()?.labels;
  return Array.isArray(labels) && labels.some((entry) => nameOf(entry) === label);
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
