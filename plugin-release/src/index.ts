import * as core from '@actions/core';
import { checkRelease } from './check-release';

export function run(): void {
  try {
    const { released, errors } = checkRelease({
      root: process.cwd(),
      base: core.getInput('base', { required: true }),
      pluginsDir: core.getInput('plugins-dir') || undefined,
      manifest: core.getInput('manifest') || undefined,
      changelog: core.getInput('changelog') || undefined,
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
