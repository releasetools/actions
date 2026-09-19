import * as core from '@actions/core';
import { baseSha } from './event';
import { type GuardOptions, readSettings } from './settings';

/**
 * What a guard runs on: the repository's own declaration, and the one thing
 * only the workflow knows.
 */
export function inputs(): GuardOptions {
  const root = process.cwd();
  const settings = readSettings(root);
  return {
    root,
    // A pull request already says what it is against, so the input is for the
    // runs that are not one.
    base: core.getInput('base') || baseSha() || '',
    ...settings,
  };
}

/** Reports a guard's verdict the same way whichever guard reached it. */
export function report(options: {
  passed: readonly string[];
  failures: ReadonlyArray<{ message: string }>;
  title: string;
  nothing: string;
  everything: string;
  failed: string;
}): void {
  for (const line of options.passed) {
    core.info(line);
  }
  if (options.failures.length > 0) {
    // Annotations, so the complaint lands on the pull request rather than
    // only in the log.
    for (const failure of options.failures) {
      core.error(failure.message, { title: options.title });
    }
    core.setFailed(options.failed);
    return;
  }
  core.info(options.passed.length === 0 ? options.nothing : options.everything);
}
