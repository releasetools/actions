import { type Change, changesIn, newestReachableTag, requiredIncrement } from '../../lib/src/changes';
import type { ProjectGroup } from '../../lib/src/config';
import { type Git, spawnGit } from '../../lib/src/git';
import {
  type Project,
  UsageError,
  readInside,
  rootOf,
  scan,
  within,
} from '../../lib/src/scan';
import type { GuardOptions } from '../../lib/src/settings';
import { type Part, type Semver, compare, format, increment, parse } from '../../lib/src/semver';
import { versionFrom } from '../../lib/src/version';

export { UsageError };
export type { Git, ProjectGroup };

export interface Failure {
  project: string;
  message: string;
}

export interface Result {
  /** One line per project whose version moved far enough. */
  moved: string[];
  failures: Failure[];
}

/**
 * Checks that each changed, versioned project increments its version far enough.
 *
 * A fix shipped under the old version reaches nobody, because a client
 * compares versions to decide whether an update exists. How far is far enough
 * is not a judgement about the size of a diff: it follows from what the
 * changes say they are.
 */
export function guardVersions(options: GuardOptions): Result {
  const git = options.git ?? spawnGit;
  const root = rootOf(options.root);
  const { against, found, failures: scanned } = scan({ ...options, git });

  const moved: string[] = [];
  const failures: Failure[] = scanned.map((failure) => ({ ...failure }));
  const single = options.projects.length === 1;
  // A repository that excepts bump-from-type has not agreed that a type says
  // how far to move, so there is nothing to read the types for.
  const fromType = !(options.except ?? []).includes('bump-from-type');

  for (const { project, material, manifests } of found) {
    if (manifests.length === 0) {
      continue;
    }

    const declared = agreedVersion(root, manifests);
    if ('failed' in declared) {
      if (material) {
        failures.push({ project: project.label, message: declared.failed });
      }
      continue;
    }

    const changes = changesIn(git, root, `${against}..HEAD`, project.path === '' ? '.' : project.path);

    /*
     * The type is the author saying whether anybody can observe this, so it
     * beats the paths: a `docs:` touching source asks for nothing. Where no
     * change in the range carries one, there is nothing to read and the older
     * rule applies, which is that anything material has to move the version.
     */
    const typed = fromType && changes.some((change) => change.type !== null);
    const required = typed ? requiredIncrement(changes) : material ? 'patch' : null;
    if (required === null) {
      continue;
    }

    const baseline = baselineOf(git, root, against, project, manifests, single);
    if (baseline === null) {
      moved.push(`${project.label} is new, at ${format(declared.version)}`);
      continue;
    }

    const needed = increment(baseline, required);
    if (compare(declared.version, needed) >= 0) {
      moved.push(`${project.label} ${format(baseline)} -> ${format(declared.version)}`);
      continue;
    }

    failures.push({
      project: project.label,
      message:
        `${project.label} is at ${format(declared.version)}, and ${reason(changes, required)} ` +
        `asks for at least ${format(needed)} after ${format(baseline)}. Somebody has ` +
        `${format(baseline)} installed, and a client compares versions to decide whether ` +
        'an update exists.',
    });
  }

  return { moved, failures };
}

/** What made the increment necessary, named so the message can be acted on. */
function reason(changes: readonly Change[], part: Part): string {
  const breaking = changes.find((change) => change.breaking);
  if (breaking) {
    return `a breaking change (${breaking.subject})`;
  }
  const typed = changes.find((change) => change.type !== null);
  return typed ? `a ${typed.type} (${typed.subject})` : `a ${part}`;
}

/**
 * What this project last released.
 *
 * A tag first, and the newest one reachable from here rather than the newest
 * by date: a backport released yesterday on another line is not an ancestor
 * of this commit, and taking it as the baseline would ask the wrong question.
 * Where no such tag is reachable, whether because the repository tags nothing
 * or because it tags a published tree outside its own history, the baseline is
 * what the manifest said at the fork point.
 */
function baselineOf(
  git: Git,
  root: string,
  against: string,
  project: Project,
  manifests: readonly string[],
  single: boolean,
): Semver | null {
  const shape = single ? EXACT : `${nameOf(project)}/${EXACT}`;
  const tag = newestReachableTag(git, root, shape);
  if (tag !== null) {
    const parsed = parse(tag.replace(`${nameOf(project)}/`, ''));
    if (parsed !== null) {
      return parsed;
    }
  }

  for (const file of manifests) {
    const before = git(root, ['show', `${against}:${file}`]);
    if (before.status !== 0) {
      continue;
    }
    try {
      return parse(versionFrom(file, before.stdout));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The shape of a tag naming one release. A floating major such as `v0` moves
 * to whatever released last, so it is never what a release was.
 */
const EXACT = 'v[0-9]*.[0-9]*.[0-9]*';

/** The last segment of a project's path, which is also what a scope names. */
function nameOf(project: Project): string {
  return project.path === '' ? project.label : project.path.split('/').at(-1)!;
}

/** The version every manifest a project holds agrees on. */
function agreedVersion(
  root: string,
  manifests: readonly string[],
): { version: Semver } | { failed: string } {
  const declared: Array<{ file: string; version: string }> = [];
  for (const file of manifests) {
    const text = readInside(root, file);
    if (text === null) {
      continue;
    }
    try {
      declared.push({ file, version: versionFrom(file, text) });
    } catch (err) {
      return { failed: `${file} ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const first = declared[0];
  if (!first) {
    return { failed: 'declares no version' };
  }
  const other = declared.find((entry) => entry.version !== first.version);
  if (other) {
    return {
      failed:
        `declares ${first.version} in ${first.file} and ${other.version} in ${other.file}. ` +
        'Whichever a client reads is the one that decides whether it updates, so they ' +
        'have to say the same thing.',
    };
  }

  const parsed = parse(first.version);
  if (parsed === null) {
    return {
      failed:
        `declares ${first.version}, which is not a semantic version. A range, a lockfile ` +
        'and a resolver all read one, and none of them can read this.',
    };
  }
  return { version: parsed };
}

export { within };
