import * as fs from 'node:fs';
import * as path from 'node:path';
import { isGlob, normalise, segmentPattern } from './glob';
import { UsageError } from './usage-error';

/** One versioned thing in the repository. */
export interface Project {
  /** Repository-relative directory, empty for the repository root. */
  path: string;
  /** What the output calls it: the path, or the repository's own name. */
  label: string;
  /** Absolute directory. */
  directory: string;
  /**
   * Whether a pattern named this directory rather than turning it up.
   *
   * A name is a claim that the directory is a project, so one that declares no
   * version is a mistake worth reporting. A glob is a search, and a search
   * that walks past a docs directory has not found anything wrong.
   */
  named: boolean;
}

/**
 * Turns the caller's patterns into the directories to check.
 *
 * `./` is the repository itself, one project, which is what a repository with
 * a single version needs. `./*` is every directory at the top, `packages/*`
 * every directory under one of them, and a plain path is itself. Patterns
 * expand a segment at a time rather than by walking the whole repository, so
 * naming a directory costs a readdir of its parent.
 *
 * A pattern matching nothing is an error rather than an empty pass. Silently
 * checking no projects is the one outcome that looks like success and is not.
 */
export function resolveProjects(root: string, patterns: readonly string[]): Project[] {
  const wanted = patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern !== '');
  if (wanted.length === 0) {
    throw new UsageError('no project to check; name one, or use ./ for the repository itself');
  }

  const found = new Map<string, boolean>();
  for (const pattern of wanted) {
    const matches = expand(root, pattern);
    if (matches.length === 0) {
      throw new UsageError(`no directory matches ${pattern}`);
    }
    const named = !isGlob(pattern);
    for (const match of matches) {
      found.set(match, (found.get(match) ?? false) || named);
    }
  }

  return [...found.keys()]
    .sort()
    .map((relative) => ({
      path: relative,
      label: relative === '' ? path.basename(root) : relative,
      directory: relative === '' ? root : path.join(root, relative),
      named: found.get(relative) ?? false,
    }));
}

function expand(root: string, pattern: string): string[] {
  const cleaned = normalise(pattern);
  if (cleaned === '' || cleaned === '.') {
    return [''];
  }

  let current = [''];
  for (const segment of cleaned.split('/')) {
    const next: string[] = [];
    for (const parent of current) {
      if (isGlob(segment)) {
        const expression = new RegExp(`^${segmentPattern(segment)}$`);
        for (const name of childDirectories(path.join(root, parent))) {
          if (expression.test(name)) {
            next.push(parent === '' ? name : `${parent}/${name}`);
          }
        }
      } else {
        const candidate = parent === '' ? segment : `${parent}/${segment}`;
        if (isDirectory(path.join(root, candidate))) {
          next.push(candidate);
        }
      }
    }
    current = next;
  }
  return current;
}

/** The directories inside one, hidden ones excluded the way a glob excludes them. */
function childDirectories(directory: string): string[] {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}
