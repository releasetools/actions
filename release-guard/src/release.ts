import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ignoreMatcher } from './ignore';
import { versionFrom } from './version';
import { type Project, resolveProjects } from './projects';
import { UsageError } from './usage-error';

export { UsageError };

/** One git invocation: how it exited, and what it wrote. */
export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs git inside a working directory. The tests inject their own. */
export type Git = (cwd: string, args: string[]) => GitResult;

/** What the caller gets when it says nothing. */
export const DEFAULTS = {
  /** The repository itself, which is what a single-version repository needs. */
  projects: ['./'],
  /**
   * Where a version is declared, tried in order until one is there. The list
   * is what an unconfigured repository is most likely to hold, so a project
   * that keeps its version somewhere else names that file and nothing more.
   */
  manifests: ['package.json', 'pyproject.toml', 'Cargo.toml', 'VERSION'],
  /**
   * No changelog is asked for until one is named. Most repositories keep none
   * per project, and a check that fails every one of them on the day it is
   * installed is a check nobody installs twice.
   */
  checkChangelog: '',
  /**
   * Files whose edits are not a change to the project, on top of the ones a
   * release writes, which are never counted whatever this says. CHANGELOG.md
   * is here for the repository that keeps one without asking this to check it.
   */
  ignoreFiles: ['CHANGELOG.md', 'README.md', 'LICENSE'],
} as const;

export interface CheckOptions {
  /** Repository root. Every other path is relative to it. */
  root: string;
  /** Ref the working tree is compared against, such as origin/main. */
  base: string;
  /** Directories to check, as paths or globs. `./` is the repository itself. */
  projects?: readonly string[];
  /** Where the version is declared, relative to a project, first one found. */
  manifests?: readonly string[];
  /** Changelog to check, relative to a project. Empty asks for none. */
  checkChangelog?: string;
  /** Files whose edits do not count as the project changing. */
  ignoreFiles?: readonly string[];
  /** Whether those patterns are matched case-sensitively. */
  caseSensitive?: boolean;
  git?: Git;
}

/**
 * Which half of the rule a failure came from.
 *
 * The two travel together because neither stands alone: a version that moved
 * with nothing written down is half a release, and a changelog checked against
 * a version that never moved passes on an entry written a year ago. They are
 * named apart so a reviewer can see from the annotation which one fired.
 */
export type Rule = 'version' | 'changelog' | 'setup';

export interface Failure {
  rule: Rule;
  message: string;
}

export interface CheckResult {
  /** One line per project that recorded its new version. */
  released: string[];
  /** One per project that did not. */
  errors: Failure[];
}

/**
 * Every project whose source changed has to record the change: a version that
 * moved, and a changelog section carrying that same version.
 *
 * Where a repository publishes from its main branch, an edit is just a commit
 * and the merge is the release, which leaves the diff as the only place
 * either half can be enforced. A fix shipped under the old version reaches
 * nobody, because a client compares versions to decide whether an update
 * exists. A fix shipped with no entry loses the reasoning while somebody
 * still remembers it.
 */
export function guard(options: CheckOptions): CheckResult {
  const {
    base,
    projects = DEFAULTS.projects,
    manifests = DEFAULTS.manifests,
    checkChangelog = DEFAULTS.checkChangelog,
    ignoreFiles = DEFAULTS.ignoreFiles,
    caseSensitive = false,
    git = spawnGit,
  } = options;

  if (base.trim() === '') {
    throw new UsageError(
      'nothing to compare against. On a pull request the base comes from the ' +
        'event; anywhere else, name one, for example origin/main',
    );
  }

  const root = path.resolve(options.root);

  /*
   * The files a release writes never count as the change it records. A
   * changelog entry and a version bump are how a project says what happened,
   * so counting them would ask for a release whose only content is the
   * sentence announcing it. They are read, and they decide the verdict; they
   * just do not raise the question.
   */
  const written = [checkChangelog, ...manifests].filter((name) => name.trim() !== '');
  const ignored = ignoreMatcher([...written, ...ignoreFiles], caseSensitive);

  // Where the pull request forked, which is the diff GitHub shows under Files
  // changed. Against a branch tip instead, anything the base gained since the
  // fork reads as this project's change, backwards.
  const forked = git(root, ['merge-base', base, 'HEAD']);
  const against = forked.status === 0 && forked.stdout.trim() !== '' ? forked.stdout.trim() : base;

  const released: string[] = [];
  const errors: Failure[] = [];

  for (const project of resolveProjects(root, projects)) {
    const manifestPath = manifests
      .map((candidate) => within(project, candidate))
      .find((candidate) => fs.existsSync(path.join(root, candidate)));
    if (manifestPath === undefined && !project.named) {
      // A glob turned up a directory that declares no version, so it is a
      // directory rather than a project. `./*` over a repository is a search.
      continue;
    }

    const changed = changedFiles(git, root, against, base, project);
    if (typeof changed === 'string') {
      errors.push({ rule: 'setup', message: changed });
      continue;
    }
    if (changed.length === 0) {
      continue;
    }

    /*
     * Work, as opposed to the files a release writes. A project with none of
     * it is still judged when its version moved, because a version that moves
     * is a release however little came with it, and is exactly where "bump it
     * and write it up later" hides.
     */
    const material = changed.some((file) => !ignored(file));

    if (manifestPath === undefined) {
      if (!material) {
        continue;
      }
      errors.push({
        rule: 'setup',
        message:
          `${project.label} declares no version. Looked for ${manifests.join(', ')}; ` +
          'name the file that holds it.',
      });
      continue;
    }

    let now: string;
    try {
      now = versionFrom(manifestPath, fs.readFileSync(path.join(root, manifestPath), 'utf8'));
    } catch (err) {
      if (!material) {
        continue;
      }
      errors.push({ rule: 'setup', message: `${manifestPath} ${message(err)}` });
      continue;
    }

    // Absent at the fork point means the project is new, and its first version
    // is whatever it says.
    const before = git(root, ['show', `${against}:${manifestPath}`]);
    let was: string | null = null;
    if (before.status === 0) {
      try {
        was = versionFrom(manifestPath, before.stdout);
      } catch (err) {
        if (!material) {
          continue;
        }
        errors.push({ rule: 'setup', message: `${manifestPath} at ${base} ${message(err)}` });
        continue;
      }
    }

    const moved = was === null || compareVersions(now, was) > 0;
    if (!material && !moved) {
      // Only the files a release writes moved, and no release came with them.
      continue;
    }

    if (was === null) {
      released.push(`${project.label} is new, at ${now}`);
    } else if (!moved) {
      errors.push({
        rule: 'version',
        message:
          `${project.label} changed but its version is still ${now}. Somebody has ${was} ` +
          'installed, and a client compares versions to decide whether an update ' +
          'exists, so bump it before merging.',
      });
      continue;
    } else {
      released.push(`${project.label} ${was} -> ${now}`);
    }

    if (checkChangelog !== '') {
      const complaint = changelogError(root, project, checkChangelog, now);
      if (complaint) {
        errors.push({ rule: 'changelog', message: complaint });
      }
    }
  }

  return { released, errors };
}

/**
 * What changed inside a project, project-relative, or the complaint about why
 * git could not say.
 *
 * Two questions, because they have two answers. `diff` knows what moved
 * against the base ref and nothing about a file git has never seen, and
 * `ls-files --others` knows the new ones. A project somebody just wrote is
 * untracked until it is added, and a command that called that repository
 * clean would be worth nothing to the person running it before they push.
 */
function changedFiles(
  git: Git,
  root: string,
  against: string,
  named: string,
  project: Project,
): string[] | string {
  const pathspec = project.path === '' ? '.' : project.path;

  const diff = git(root, ['diff', '--name-only', against, '--', pathspec]);
  if (diff.status !== 0) {
    return `cannot compare against ${named}: ${diff.stderr.trim()}`;
  }
  const untracked = git(root, [
    'ls-files',
    '--full-name',
    '--others',
    '--exclude-standard',
    '--',
    pathspec,
  ]);
  if (untracked.status !== 0) {
    return `cannot list new files under ${project.label}: ${untracked.stderr.trim()}`;
  }

  const prefix = project.path === '' ? '' : `${project.path}/`;
  const files = new Set<string>();
  for (const line of [...lines(diff.stdout), ...lines(untracked.stdout)]) {
    files.add(line.startsWith(prefix) ? line.slice(prefix.length) : line);
  }
  return [...files];
}

function lines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** A path inside a project, as the repository sees it. */
function within(project: Project, relative: string): string {
  return project.path === '' ? relative : `${project.path}/${relative}`;
}

/** The complaint about a project's changelog, or null when it carries the version. */
function changelogError(
  root: string,
  project: Project,
  changelog: string,
  version: string,
): string | null {
  const relative = within(project, changelog);
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    return (
      `${project.label} is at ${version} and has no ${changelog}. A release writes itself ` +
      `into ${relative}, newest first: what changed, and the choices behind it.`
    );
  }
  if (carries(fs.readFileSync(file, 'utf8'), version)) {
    return null;
  }
  return (
    `${relative} has no section for ${version}. Add one above the older releases: ` +
    'what changed, and the reason not to act that a later change cannot get from the diff.'
  );
}

/**
 * Whether a changelog opens a section for this version.
 *
 * Dated or bare, with or without a `v`, and with or without the brackets Keep
 * a Changelog puts round a version so it can be linked.
 */
function carries(text: string, version: string): boolean {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^##\\s+\\[?v?${escaped}\\]?(\\s|$)`, 'm').test(text);
}

/**
 * Numeric, segment by segment, the way a client decides whether an update
 * exists. A segment that is not a number counts as zero, so a suffix such as
 * -rc1 never reads as an increase on its own.
 */
function compareVersions(left: string, right: string): number {
  const a = segments(left);
  const b = segments(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const one = a[index] ?? 0;
    const two = b[index] ?? 0;
    if (one !== two) {
      return one < two ? -1 : 1;
    }
  }
  return 0;
}

function segments(version: string): number[] {
  return version.split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    return Number.isNaN(value) ? 0 : value;
  });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function spawnGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
