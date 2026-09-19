import { carries } from '../../lib/src/changelog';
import type { ProjectGroup } from '../../lib/src/config';
import { type Git, spawnGit } from '../../lib/src/git';
import {
  DEFAULTS,
  UsageError,
  readInside,
  rootOf,
  scan,
  within,
} from '../../lib/src/scan';
import type { GuardOptions } from '../../lib/src/settings';
import { versionFrom } from '../../lib/src/version';

export { DEFAULTS, UsageError };
export type { Git, ProjectGroup };

export interface Failure {
  project: string;
  message: string;
}

export interface Result {
  /** One line per project whose changelog carries the version it claims. */
  recorded: string[];
  failures: Failure[];
}

/**
 * Every project whose source changed says so in its changelog.
 *
 * What that means in a diff: the project's changelog carries a `##` heading
 * naming the version its manifest declares. A change a reader can observe
 * moves that version, so the heading is a new one, and writing what goes
 * under it belongs to the change rather than to whoever cuts the release.
 *
 * A fix shipped with nothing written down loses the reasoning while somebody
 * still remembers it, and the reader who needs it is on the previous version
 * deciding whether this one affects them.
 */
export function guardChangelogs(options: GuardOptions): Result {
  // A repository that excepts the convention is not asked about it, which is
  // what naming a convention in `except` means.
  if ((options.except ?? []).includes('changelog-per-change')) {
    return { recorded: [], failures: [] };
  }

  const git: Git = options.git ?? spawnGit;
  const root = rootOf(options.root);
  const { found, failures: scanned } = scan({ ...options, git });

  const recorded: string[] = [];
  const failures: Failure[] = scanned.map((failure) => ({ ...failure }));

  for (const { project, material, manifests } of found) {
    if (project.changelog === '' || !material || manifests.length === 0) {
      continue;
    }

    let version: string;
    try {
      const text = readInside(root, manifests[0]!);
      if (text === null) {
        continue;
      }
      version = versionFrom(manifests[0]!, text);
    } catch {
      // The version is the other guard's complaint. This one has nothing to
      // look for and says nothing rather than saying it twice.
      continue;
    }

    const relative = within(project, project.changelog);
    const changelog = readInside(root, relative);
    if (changelog === null) {
      failures.push({
        project: project.label,
        message:
          `${project.label} is at ${version} and has no ${project.changelog}. A release ` +
          `writes itself into ${relative}, newest first: what changed, and the choices ` +
          'behind it.',
      });
      continue;
    }

    if (!carries(changelog, version)) {
      failures.push({
        project: project.label,
        message:
          `${relative} has no section for ${version}. Add one above the older releases: ` +
          'what changed, and the reason not to act that a later change cannot get from ' +
          'the diff.',
      });
      continue;
    }

    recorded.push(`${project.label} ${version}`);
  }

  return { recorded, failures };
}
