import * as core from '@actions/core';
import { report } from '../../lib/src/action';
import { guardTrigger } from './triggers';

export function run(): void {
  try {
    const { skipped, passed, failures } = guardTrigger(process.cwd());
    if (skipped !== undefined) {
      core.info(skipped);
      return;
    }
    report({
      passed,
      failures,
      title: 'Publish workflow does not match release.trigger',
      nothing: 'No trigger to check',
      everything: 'The publish workflow accepts every trigger .releasetools.yaml declares',
      failed: 'Trigger check failed. See the annotations.',
    });
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
