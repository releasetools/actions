import * as fs from 'node:fs';
import * as core from '@actions/core';
import { section } from '../../lib/src/changelog';

/**
 * Hands one version's changelog section to whatever publishes the release.
 *
 * It reads the heading the way changelog-guard reads it, so the entry a pull
 * request was made to write is the entry the release publishes, rather than
 * two readers disagreeing about which lines belong to a version.
 */
export function run(): void {
  try {
    const version = core.getInput('version', { required: true }).replace(/^v/, '');
    const changelog = core.getInput('changelog') || 'CHANGELOG.md';

    let text: string;
    try {
      text = fs.readFileSync(changelog, 'utf8');
    } catch (err) {
      core.setFailed(`cannot read ${changelog}: ${err instanceof Error ? err.message : err}`);
      return;
    }

    const notes = section(text, version);
    core.setOutput('found', notes !== '');
    core.setOutput('notes', notes);

    if (notes === '') {
      // Not a failure: a caller that wants one reads `found` and says so in
      // its own words. A release workflow fails; a draft might not.
      core.info(`${changelog} has no section for ${version}`);
      return;
    }
    core.info(`${changelog} describes ${version} in ${notes.split('\n').length} line(s)`);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
