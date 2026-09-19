import * as core from '@actions/core';
import { inputs, report } from '../../lib/src/action';
import { skipRequested } from '../../lib/src/skip';
import { guardChangelogs } from './changelogs';

const SKIP_LABEL = 'skip-changelog-guard';

export function run(): void {
  try {
    if (skipRequested(SKIP_LABEL)) {
      core.notice(`Changelog check skipped: this pull request is labelled ${SKIP_LABEL}.`);
      return;
    }

    const { recorded, failures } = guardChangelogs(inputs());
    report({
      passed: recorded,
      failures,
      title: 'Changelog not updated',
      nothing: 'No project changed',
      everything: 'Every changed project recorded what changed',
      failed: 'Changelog check failed. See the annotations.',
    });
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
