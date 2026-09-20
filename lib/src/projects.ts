import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectGroup } from './config';
import { normalise } from './glob';
import { UsageError } from './usage-error';

/** One declared project and what its group asks of it. */
export interface Project {
  /** Repository-relative directory, empty for the repository root. */
  path: string;
  /** What the output calls it: the path, or the repository's own name. */
  label: string;
  /** Absolute directory. */
  directory: string;
  /** Files that may declare the version. Every one it holds must agree. */
  manifests: readonly string[];
  /** Changelog to check, or empty for none. */
  changelog: string;
}

/**
 * Resolves named directories, refusing patterns and paths that are not directories.
 * `./` names the repository root. A directory belongs to the first group naming it.
 */
export function resolveProjects(
  root: string,
  groups: readonly ProjectGroup[],
  fallbackManifests: readonly string[],
): Project[] {
  if (groups.length === 0) {
    throw new UsageError('no project to check; name one, or use ./ for the repository itself');
  }

  const found = new Map<string, Project>();
  for (const group of groups) {
    const paths = group.path.map((name) => name.trim()).filter((name) => name !== '');
    if (paths.length === 0) {
      throw new UsageError('no project to check; name one, or use ./ for the repository itself');
    }

    for (const name of paths) {
      if (/[*?[\]{}]|[!+@]\(/.test(name)) {
        throw new UsageError(`project path ${name} must name a directory; patterns are not allowed`);
      }
      const cleaned = normalise(name);
      const relative = cleaned === '.' ? '' : cleaned;
      const directory = relative === '' ? root : path.join(root, relative);
      if (!isDirectory(directory)) {
        throw new UsageError(`project path ${name} is not a directory`);
      }
      if (found.has(relative)) {
        continue;
      }
      found.set(relative, {
        path: relative,
        label: relative === '' ? path.basename(root) : relative,
        directory,
        manifests: group.manifest ?? fallbackManifests,
        changelog: group.changelog ?? '',
      });
    }
  }

  return [...found.values()].sort((one, two) => (one.path < two.path ? -1 : 1));
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}
