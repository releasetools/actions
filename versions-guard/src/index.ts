import * as core from '@actions/core';
import { inputs, report } from '../../lib/src/action';
import { skipRequested } from '../../lib/src/skip';
import { guardVersions } from './versions';

const SKIP_LABEL = 'skip-versions-guard';

export function run(): void {
  try {
    if (skipRequested(SKIP_LABEL)) {
      // A notice rather than a log line: a check somebody turned off should
      // be visible on the pull request that turned it off.
      core.notice(`Version check skipped: this pull request is labelled ${SKIP_LABEL}.`);
      return;
    }

    const { moved, failures } = guardVersions(inputs());
    report({
      passed: moved,
      failures,
      title: 'Version not bumped',
      nothing: 'No project changed',
      everything: 'Every changed project moved its version far enough',
      failed: 'Version check failed. See the annotations.',
    });
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
