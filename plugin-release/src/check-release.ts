import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** One git invocation: how it exited, and what it wrote. */
export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs git inside a working directory. The tests inject their own. */
export type Git = (cwd: string, args: string[]) => GitResult;

/** Where things are when the caller says nothing. */
export const DEFAULTS = {
  pluginsDir: 'plugins',
  manifest: '.claude-plugin/plugin.json',
  changelog: 'CHANGELOG.md',
} as const;

export interface CheckOptions {
  /** Repository root. Every other path is relative to it. */
  root: string;
  /** Ref the working tree is compared against, such as origin/main. */
  base: string;
  /** Directory holding one subdirectory per plugin. */
  pluginsDir?: string;
  /** Manifest carrying the version, relative to a plugin's directory. */
  manifest?: string;
  /** Changelog, relative to a plugin's directory. */
  changelog?: string;
  git?: Git;
}

export interface CheckResult {
  /** One line per plugin that declared a release. */
  released: string[];
  /** One line per plugin that changed without declaring one. */
  errors: string[];
}

/** The invocation was wrong, so no plugin was judged. Exit code 2. */
export class UsageError extends Error {}

/**
 * A plugin that changed declares its release: a version that moved, and a
 * changelog section carrying it.
 *
 * The plugins are written in the repository and the merge is the release, so
 * an edit is just a commit, which leaves the diff as the only place either
 * rule can be enforced. A fix shipped under the old version reaches nobody,
 * because a client compares versions to decide whether an update exists. A
 * fix shipped with no changelog entry loses the reasoning while somebody
 * still remembers it.
 */
export function checkRelease(options: CheckOptions): CheckResult {
  const {
    base,
    pluginsDir = DEFAULTS.pluginsDir,
    manifest = DEFAULTS.manifest,
    changelog = DEFAULTS.changelog,
    git = spawnGit,
  } = options;

  if (base.trim() === '') {
    throw new UsageError('base is required, for example origin/main');
  }

  const root = path.resolve(options.root);
  const directory = path.join(root, pluginsDir);
  if (!fs.existsSync(directory)) {
    throw new UsageError(`no plugins directory at ${pluginsDir}`);
  }

  const released: string[] = [];
  const errors: string[] = [];

  for (const name of subdirectories(directory)) {
    const relative = `${pluginsDir}/${name}`;

    const diff = git(root, ['diff', '--name-only', base, '--', relative]);
    if (diff.status !== 0) {
      errors.push(`cannot compare against ${base}: ${diff.stderr.trim()}`);
      continue;
    }
    if (diff.stdout.trim() === '') {
      continue;
    }

    let now: string;
    try {
      now = versionIn(fs.readFileSync(path.join(directory, name, manifest), 'utf8'));
    } catch (err) {
      errors.push(`${relative}/${manifest} ${reason(err)}`);
      continue;
    }

    const before = git(root, ['show', `${base}:${relative}/${manifest}`]);
    if (before.status !== 0) {
      // Not there at the base commit, so this is a new plugin and its first
      // version is whatever it says.
      released.push(`${name} is new, at ${now}`);
    } else {
      let was: string;
      try {
        was = versionIn(before.stdout);
      } catch (err) {
        errors.push(`${relative}/${manifest} at ${base} ${reason(err)}`);
        continue;
      }
      if (compareVersions(now, was) <= 0) {
        errors.push(
          `${relative}/ changed but its version is still ${now}. Somebody has ${was} ` +
            'installed, and a client compares versions to decide whether an update ' +
            'exists, so bump it before merging.',
        );
        continue;
      }
      released.push(`${name} ${was} -> ${now}`);
    }

    const complaint = changelogError(path.join(directory, name), relative, changelog, now);
    if (complaint) {
      errors.push(complaint);
    }
  }

  return { released, errors };
}

/** The complaint about a plugin's changelog, or null when it carries the version. */
function changelogError(
  directory: string,
  relative: string,
  changelog: string,
  version: string,
): string | null {
  const file = path.join(directory, changelog);
  if (!fs.existsSync(file)) {
    return (
      `${relative}/ is at ${version} and has no ${changelog}. A release writes itself ` +
      `into ${relative}/${changelog}, newest first: what changed, and the choices behind it.`
    );
  }
  if (carries(fs.readFileSync(file, 'utf8'), version)) {
    return null;
  }
  return (
    `${relative}/${changelog} has no section for ${version}. Add one above the older ` +
    'releases: what changed, and the reason not to act that a later change cannot get ' +
    'from the diff.'
  );
}

/** Whether a changelog opens a section for this version, dated or bare. */
function carries(text: string, version: string): boolean {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^##\\s+v?${escaped}(\\s|$)`, 'm').test(text);
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

function subdirectories(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
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
