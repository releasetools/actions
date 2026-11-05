import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONFIG_FILE, settingsFrom } from '../../packages/config/releasetools-config';
import { carries, section } from '../../lib/src/changelog';
import { versionFrom } from '../../lib/src/version';

/** A bare semantic version: no v, no build metadata. */
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

export interface PreflightInput {
  /** The repository's checkout. */
  root: string;
  version: string;
  /** The `commit` input: a full SHA, or HEAD. */
  commit: string;
  /** The commit the run checked out, GITHUB_SHA. */
  sha: string;
  /** Whether v<version> already exists. */
  tagExists: boolean;
  replace: boolean;
  /** Release notes for a section with no entries. */
  emptyNotes: string;
}

export interface Preflight {
  failures: string[];
  tag: string;
  major: string;
  /** The release notes, as the GitHub release shows them. */
  notes: string;
  replacing: boolean;
}

/**
 * Everything a dispatched publish refuses before it publishes anything, per
 * FORMAT's "Configuration" rules 26 and 27 and "Release notes" 1 to 5: a
 * version that is not bare, a commit other than the release commit, a
 * manifest declaring another version, a tag that already exists, and a
 * changelog with no section for the version. Every refusal is collected, so
 * one run names all of them.
 */
export function preflight(input: PreflightInput): Preflight {
  const failures: string[] = [];
  const version = input.version.trim();
  const tag = `v${version}`;
  const major = `v${version.split('.')[0]}`;
  let notes = '';

  if (!VERSION.test(version)) {
    failures.push(`version must be a semantic version with no v, like 1.5.2 (got: ${input.version || '<empty>'})`);
    return { failures, tag, major, notes, replacing: false };
  }

  const commit = input.commit.trim() || 'HEAD';
  if (commit !== 'HEAD' && commit !== input.sha) {
    failures.push(
      `asked to publish ${commit}, but the run checked out ${input.sha}. Dispatch on a ref that names the release commit.`,
    );
  }

  const file = path.join(input.root, CONFIG_FILE);
  if (!fs.existsSync(file)) {
    failures.push(`${CONFIG_FILE} is missing, so nothing says which manifests declare the version.`);
    return { failures, tag, major, notes, replacing: false };
  }
  const declared = settingsFrom(fs.readFileSync(file, 'utf8'));
  const own = declared.projects.find((group) => group.path.some((entry) => entry === './' || entry === '.'));
  const manifests = own?.manifest ?? [];
  if (manifests.length === 0) {
    failures.push(`${CONFIG_FILE} names no manifest for the repository's own project, so its version cannot be checked.`);
  }
  for (const manifest of manifests) {
    const at = path.join(input.root, manifest);
    let found: string;
    try {
      found = versionFrom(manifest, fs.readFileSync(at, 'utf8'));
    } catch (err) {
      failures.push(`cannot read a version from ${manifest}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (found !== version) {
      failures.push(`${manifest} declares ${found}, not ${version}. Bump it in a pull request, then publish.`);
    }
  }

  const replacing = input.tagExists && input.replace;
  if (input.tagExists && !input.replace) {
    failures.push(`${tag} already exists. Release the next version instead.`);
  }
  if (input.replace && !declared.except.includes('immutable-tag')) {
    failures.push(
      `replace moves ${tag}, which ${CONFIG_FILE} does not allow: it keeps immutable-tag. Release the next version instead.`,
    );
  }

  const changelog = own?.changelog ?? 'CHANGELOG.md';
  const text = fs.existsSync(path.join(input.root, changelog))
    ? fs.readFileSync(path.join(input.root, changelog), 'utf8')
    : null;
  if (text === null || !carries(text, version)) {
    failures.push(`${changelog} has no section for ${version}. Write it in a pull request, then publish.`);
  } else {
    notes = flatten(section(text, version)) || input.emptyNotes;
  }

  return { failures, tag, major, notes, replacing };
}

/**
 * A changelog section as a release shows it: the entries without the `###`
 * headings that group them, since a release holds one version.
 */
export function flatten(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^###\s/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
