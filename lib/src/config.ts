import * as path from 'node:path';
import { UsageError } from './usage-error';

/**
 * One group of projects and what they owe.
 *
 * A repository is rarely one kind of thing. The crates under `crates/` keep
 * their version in a Cargo.toml and the packages under `packages/` in a
 * package.json, and asking one list of candidates to serve both left the
 * answer depending on which was listed first. A group says which files govern
 * which directories, and nothing has to be guessed.
 */
export interface ProjectGroup {
  /** Directories, as paths or globs. */
  path: string[];
  /** Files that may declare the version. Every one a project holds must agree. */
  manifest?: string[];
  /** Changelog to check, relative to a project. Absent asks for none. */
  changelog?: string;
}

const KEYS = ['path', 'manifest', 'changelog'];

/**
 * Reads the `projects` key of `.releasetools.yml`.
 *
 * Strict about its own shape: an unknown key is a typo far more often than an
 * intention, and a run configured by a typo checks the wrong thing quietly.
 */
export function projectsFrom(value: unknown, where: string): ProjectGroup[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new UsageError(
      `${where} must be a list of entries, each with a path, for example:\n` +
        '  projects:\n    - path: packages/*\n      manifest: package.json\n' +
        '      changelog: CHANGELOG.md',
    );
  }

  return value.map((entry, index) => group(entry, `${where} entry ${index + 1}`));
}

function group(entry: unknown, where: string): ProjectGroup {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new UsageError(`${where} must be an entry with a path`);
  }

  const record = entry as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!KEYS.includes(key)) {
      throw new UsageError(`${where} has no ${key}; the keys are ${KEYS.join(', ')}`);
    }
  }

  const paths = strings(record['path'], `${where} path`);
  if (paths.length === 0) {
    throw new UsageError(`${where} needs a path`);
  }
  paths.forEach((value) => within(value, `${where} path`));

  const manifest = strings(record['manifest'], `${where} manifest`);
  manifest.forEach((value) => within(value, `${where} manifest`));

  const changelog = record['changelog'];
  if (changelog !== undefined && typeof changelog !== 'string') {
    throw new UsageError(`${where} changelog must be the name of one file`);
  }
  if (typeof changelog === 'string' && changelog.trim() !== '') {
    within(changelog.trim(), `${where} changelog`);
  }

  return {
    path: paths,
    ...(manifest.length > 0 ? { manifest } : {}),
    ...(typeof changelog === 'string' && changelog.trim() !== '' ? { changelog } : {}),
  };
}

/**
 * Refuses a path that leaves the repository before anything acts on it.
 *
 * Everything here is read relative to the checkout, and a workflow that wires
 * this input from somewhere less trusted than the workflow file should not be
 * one step from reading the runner's home directory.
 */
function within(value: string, where: string): void {
  if (path.isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw new UsageError(`${where} must be inside the repository, so not an absolute path`);
  }
  if (
    path
      .normalize(value)
      .split(/[\\/]/)
      .some((segment) => segment === '..')
  ) {
    throw new UsageError(`${where} must be inside the repository, so no ..`);
  }
}

/** One name or several, since a group with a single path should not need a list. */
function strings(value: unknown, where: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? [] : [value.trim()];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return (value as string[]).map((item) => item.trim()).filter((item) => item !== '');
  }
  throw new UsageError(`${where} must be one name or a list of them`);
}
