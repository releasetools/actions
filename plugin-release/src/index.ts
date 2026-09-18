import * as core from '@actions/core';
import { checkRelease } from './check-release';
import { carriesLabel, pullRequestLabels } from './skip-label';

export function run(): void {
  try {
    const skipLabel = core.getInput('skip-label');
    if (carriesLabel(pullRequestLabels(), skipLabel)) {
      // A notice rather than a log line: a check somebody turned off should
      // be visible on the pull request that turned it off.
      core.notice(`Release check skipped: this pull request is labelled ${skipLabel}.`);
      return;
    }

    const { released, errors } = checkRelease({
      root: process.cwd(),
      base: core.getInput('base', { required: true }),
      pluginsDir: core.getInput('plugins-dir') || undefined,
      manifest: core.getInput('manifest') || undefined,
      changelog: core.getInput('changelog') || undefined,
      ignore: core.getMultilineInput('ignore'),
    });

    for (const line of released) {
      core.info(line);
    }

    if (errors.length > 0) {
      // Annotations, so the complaint lands on the pull request rather than
      // only in the log.
      for (const error of errors) {
        core.error(error, { title: 'Release check' });
      }
      core.setFailed('Release check failed. See the annotations.');
      return;
    }

    core.info(
      released.length === 0 ? 'No plugin changed' : 'Every changed plugin declared its release',
    );
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
