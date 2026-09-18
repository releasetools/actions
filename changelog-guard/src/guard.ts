import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ignoreMatcher } from './ignore';
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
  manifest: 'package.json',
  changelog: 'CHANGELOG.md',
  /**
   * Files whose edits are not a change to the project. The changelog is here
   * because the entry a release writes lands inside the project, so counting
   * it would ask for a version whose only change is the sentence describing
   * it.
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
  /** Manifest carrying the version, relative to a project's directory. */
  manifest?: string;
  /** Changelog, relative to a project's directory. */
  changelog?: string;
  /** Files whose edits do not count as the project changing. */
  ignoreFiles?: readonly string[];
  /** Whether those patterns are matched case-sensitively. */
  caseSensitive?: boolean;
  git?: Git;
}

export interface CheckResult {
  /** One line per project that recorded its new version. */
  released: string[];
  /** One line per project that did not. */
  errors: string[];
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
    manifest = DEFAULTS.manifest,
    changelog = DEFAULTS.changelog,
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
  const ignored = ignoreMatcher(ignoreFiles, caseSensitive);

  const released: string[] = [];
  const errors: string[] = [];

  for (const project of resolveProjects(root, projects)) {
    const changed = changedFiles(git, root, base, project);
    if (typeof changed === 'string') {
      errors.push(changed);
      continue;
    }
    if (!changed.some((file) => !ignored(file))) {
      continue;
    }

    const manifestPath = within(project, manifest);
    let now: string;
    try {
      now = versionIn(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
    } catch (err) {
      errors.push(`${manifestPath} ${reason(err)}`);
      continue;
    }

    const before = git(root, ['show', `${base}:${manifestPath}`]);
    if (before.status !== 0) {
      // Not there at the base commit, so the project is new and its first
      // version is whatever it says.
      released.push(`${project.label} is new, at ${now}`);
    } else {
      let was: string;
      try {
        was = versionIn(before.stdout);
      } catch (err) {
        errors.push(`${manifestPath} at ${base} ${reason(err)}`);
        continue;
      }
      if (compareVersions(now, was) <= 0) {
        errors.push(
          `${project.label} changed but its version is still ${now}. Somebody has ${was} ` +
            'installed, and a client compares versions to decide whether an update ' +
            'exists, so bump it before merging.',
        );
        continue;
      }
      released.push(`${project.label} ${was} -> ${now}`);
    }

    const complaint = changelogError(root, project, changelog, now);
    if (complaint) {
      errors.push(complaint);
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
function changedFiles(git: Git, root: string, base: string, project: Project): string[] | string {
  const pathspec = project.path === '' ? '.' : project.path;

  const diff = git(root, ['diff', '--name-only', base, '--', pathspec]);
  if (diff.status !== 0) {
    return `cannot compare against ${base}: ${diff.stderr.trim()}`;
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

/** The version a manifest declares. */
function versionIn(text: string): string {
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch (err) {
    throw new Error(`is not valid JSON: ${message(err)}`);
  }
  const version = (manifest as { version?: unknown } | null)?.version;
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('declares no version');
  }
  return version;
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

function reason(err: unknown): string {
  return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'is not there' : message(err);
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
