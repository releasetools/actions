import * as core from '@actions/core';
import { baseSha } from './event';
import { guard, type Rule } from './release';
import { SKIP_LABEL, skipRequested } from './skip-label';

/** What each half of the rule calls itself on the pull request. */
const TITLES: Record<Rule, string> = {
  version: 'Version not bumped',
  changelog: 'Changelog not updated',
  setup: 'Release guard could not run',
};

export function run(): void {
  try {
    if (skipRequested()) {
      // A notice rather than a log line: a check somebody turned off should
      // be visible on the pull request that turned it off.
      core.notice(`Release check skipped: this pull request is labelled ${SKIP_LABEL}.`);
      return;
    }

    const { released, errors } = guard({
      root: process.cwd(),
      // A pull request already says what it is against, so the input is an
      // override for the runs that are not one.
      base: core.getInput('base') || baseSha() || '',
      projects: core.getMultilineInput('projects'),
      manifests: core.getMultilineInput('manifests'),
      // Empty is a deliberate 'this project keeps no changelog', not an absent
      // answer, so it goes through as it stands.
      changelog: core.getInput('changelog'),
      ignoreFiles: core.getMultilineInput('ignore-files'),
      // getBooleanInput throws on an empty value, which is what a caller who
      // wrote `case-sensitive: ''` gets. Read it as false and keep the
      // validation for everything else.
      caseSensitive:
        core.getInput('case-sensitive') !== '' && core.getBooleanInput('case-sensitive'),
    });

    for (const line of released) {
      core.info(line);
    }

    if (errors.length > 0) {
      // Annotations, so the complaint lands on the pull request rather than
      // only in the log, titled by the half of the rule that failed.
      for (const { rule, message } of errors) {
        core.error(message, { title: TITLES[rule] });
      }
      core.setFailed('Release check failed. See the annotations.');
      return;
    }

    core.info(
      released.length === 0 ? 'No project changed' : 'Every changed project recorded its new version',
    );
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
