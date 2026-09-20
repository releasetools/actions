import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectGroup } from './config';
import { type Git, forkPoint, lines, spawnGit } from './git';
import { ignoreMatcher } from './ignore';
import { inside, realRoot } from './inside';
import { type Project, resolveProjects } from './projects';
import { UsageError } from './usage-error';

export { UsageError };
export type { Git, Project };

/**
 * What the caller gets when it says nothing.
 *
 * Only the ignores have a default. Which projects a repository holds and where
 * each keeps its version are declared, never guessed.
 */
export const DEFAULTS = {
  ignoreFiles: ['CHANGELOG.md', 'README.md', 'LICENSE'],
} as const;

export interface ScanOptions {
  /** Repository root. Every other path is relative to it. */
  root: string;
  /** Ref the working tree is compared against, resolved to the fork point. */
  base: string;
  /** The projects the repository declared. A run with none checks nothing. */
  projects: readonly ProjectGroup[];
  ignoreFiles?: readonly string[];
  caseSensitive?: boolean;
  git?: Git;
}

/** A project the scan has something to say about. */
export interface Scanned {
  project: Project;
  /** Files changed under it, relative to it, before anything is set aside. */
  changed: readonly string[];
  /** Whether anything changed beyond what a release writes. */
  material: boolean;
  /** Manifests it holds, repository-relative, in the order its group names them. */
  manifests: readonly string[];
}

/** Something the scan could not get past, for one project or for the run. */
export interface ScanFailure {
  project: string;
  message: string;
}

export interface Scan {
  /** The fork point every comparison is against. */
  against: string;
  found: Scanned[];
  failures: ScanFailure[];
}

/** What a path that leaves the checkout is told, without naming where it went. */
export const ESCAPED = 'resolves outside the repository, so it is not read';

/**
 * Finds the projects a change touched, and what each holds.
 *
 * Both guards start here: which projects changed, what moved in them, and
 * where their manifests are. What each guard then demands of a project is its
 * own business.
 */
export function scan(options: ScanOptions): Scan {
  const {
    base,
    projects,
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

  const root = realRoot(options.root);
  const against = forkPoint(git, root, base);
  const found: Scanned[] = [];
  const failures: ScanFailure[] = [];

  for (const project of resolveProjects(root, projects)) {
    if (inside(root, project.path === '' ? '.' : project.path) === 'outside') {
      failures.push({ project: project.label, message: `${project.label} ${ESCAPED}` });
      continue;
    }

    const held: string[] = [];
    let escaped: string | null = null;
    for (const candidate of project.manifests.map((name) => within(project, name))) {
      const at = inside(root, candidate);
      if (at === 'outside') {
        escaped = candidate;
        break;
      }
      if (at !== 'absent') {
        held.push(candidate);
      }
    }
    if (escaped !== null) {
      failures.push({ project: project.label, message: `${escaped} ${ESCAPED}` });
      continue;
    }

    const changed = changedFiles(git, root, against, base, project);
    if (typeof changed === 'string') {
      failures.push({ project: project.label, message: changed });
      continue;
    }
    if (changed.length === 0) {
      continue;
    }

    /*
     * The files a release writes never count as the change it records. A
     * changelog entry and a version bump are how a project says what
     * happened, so counting them would ask for a release whose only content
     * is the sentence announcing it.
     */
    const ignored = ignoreMatcher(
      [project.changelog, ...project.manifests, ...ignoreFiles].filter(
        (name) => name.trim() !== '',
      ),
      caseSensitive,
    );

    found.push({
      project,
      changed,
      material: changed.some((file) => !ignored(file)),
      manifests: held,
    });
  }

  return { against, found, failures };
}

/** A path inside a project, as the repository sees it. */
export function within(project: Project, relative: string): string {
  return project.path === '' ? relative : `${project.path}/${relative}`;
}

/** Reads a file inside a project, refusing one that is a link out of the repository. */
export function readInside(root: string, relative: string): string | null {
  const at = inside(root, relative);
  return at === 'absent' || at === 'outside' ? null : fs.readFileSync(at.real, 'utf8');
}

/**
 * What changed inside a project, project-relative, or the complaint about why
 * git could not say.
 *
 * Two questions, because they have two answers. `diff` knows what moved
 * against the fork point and nothing about a file git has never seen, and
 * `ls-files --others` knows the new ones. A project somebody just wrote is
 * untracked until it is added.
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

/** Resolves a repository root the way every guard does. */
export function rootOf(root: string): string {
  return realRoot(path.resolve(root));
}
