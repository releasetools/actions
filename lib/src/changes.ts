import { type Git, lines } from './git';
import { type Part, type Semver, compare, parse } from './semver';

/**
 * Reading what a change says it is, from its subject.
 *
 * Working the kind back out of a diff is guesswork: a rename is a fix or a
 * break depending on whether anybody called the old name, and the diff does
 * not say. The author knows, in one word, when they write the subject, which
 * is what https://www.conventionalcommits.org/en/v1.0.0/ is for.
 */
export interface Change {
  sha: string;
  subject: string;
  /** The type, lowercased, or null when the subject carries none. */
  type: string | null;
  /** The scope, which in a repository of several projects names one. */
  scope: string | null;
  /** Marked by a `!` before the colon, or by a BREAKING CHANGE footer. */
  breaking: boolean;
}

/** What each type moves, and what it is called in a changelog. */
export const TYPES: Readonly<Record<string, { part: Part | null; section: string | null }>> = {
  feat: { part: 'minor', section: 'Added' },
  fix: { part: 'patch', section: 'Fixed' },
  perf: { part: 'patch', section: 'Changed' },
  deprecate: { part: 'minor', section: 'Deprecated' },
  remove: { part: 'minor', section: 'Removed' },
  security: { part: 'patch', section: 'Security' },
  refactor: { part: null, section: null },
  test: { part: null, section: null },
  docs: { part: null, section: null },
  build: { part: null, section: null },
  ci: { part: null, section: null },
  chore: { part: null, section: null },
  style: { part: null, section: null },
};

const SUBJECT = /^([a-zA-Z]+)(?:\(([^)]*)\))?(!)?:\s+(.+)$/;
/** Record and field separators, so a commit body cannot break the parse. */
const RECORD = '\x1e';
const FIELD = '\x1f';

/** What a subject says it is, or a change with no type when it says nothing. */
export function readSubject(sha: string, subject: string, body: string): Change {
  const match = SUBJECT.exec(subject.trim());
  if (!match) {
    return { sha, subject: subject.trim(), type: null, scope: null, breaking: false };
  }
  return {
    sha,
    subject: match[4]!,
    type: match[1]!.toLowerCase(),
    scope: match[2]?.trim() || null,
    breaking: match[3] === '!' || /^BREAKING CHANGE:/m.test(body),
  };
}

/** The changes in a range that touched a path. */
export function changesIn(git: Git, root: string, range: string, pathspec: string): Change[] {
  const log = git(root, [
    'log',
    `--format=${RECORD}%H${FIELD}%s${FIELD}%b`,
    range,
    '--',
    pathspec,
  ]);
  if (log.status !== 0) {
    return [];
  }

  const changes: Change[] = [];
  for (const record of log.stdout.split(RECORD)) {
    if (record.trim() === '') {
      continue;
    }
    const [sha, subject, body] = record.split(FIELD);
    changes.push(readSubject((sha ?? '').trim(), subject ?? '', body ?? ''));
  }
  return changes;
}

/**
 * The largest increment the changes imply, or null when none of them moves a
 * version. A breaking change outranks its own type, and one `feat` among forty
 * fixes is a minor.
 *
 * The minor is as far as this goes. Nothing derives the major: a release
 * increments it because somebody was asked and said so, and a commit subject
 * cannot say whether a release is the one that renames the product.
 */
export function requiredIncrement(changes: readonly Change[]): Part | null {
  const rank: Record<Part, number> = { patch: 1, minor: 2 };
  let largest: Part | null = null;

  for (const change of changes) {
    const part = change.breaking ? 'minor' : (change.type ? TYPES[change.type]?.part ?? null : null);
    if (part === null) {
      continue;
    }
    if (largest === null || rank[part] > rank[largest]) {
      largest = part;
    }
  }
  return largest;
}

/** A change marked breaking has to say what to do instead. */
export function breakingWithoutFooter(git: Git, root: string, sha: string): boolean {
  const body = git(root, ['log', '-1', '--format=%b', sha]);
  if (body.status !== 0) {
    return false;
  }
  const footer = /^BREAKING CHANGE:\s*(.*)$/m.exec(body.stdout);
  return footer === null || footer[1]!.trim() === '';
}

/**
 * The newest tag matching a shape whose release commit the commit being judged
 * contains, which is FORMAT's "Judging a version" rule 1.
 *
 * A tag's release commit is the tagged commit where HEAD contains it. A
 * repository that publishes a built tree tags a commit HEAD never contains,
 * and that commit's Source-Commit trailer names the release commit, or its
 * Workflow-Commit trailer on a tag published before Source-Commit was asked
 * for. `git describe` sees neither, and answers with whatever older tag the
 * branch still holds. A tag leading back to neither is another line's release
 * and is passed over.
 */
export function newestReleaseTag(git: Git, root: string, match: string): string | null {
  const listed = git(root, ['tag', '--list', match]);
  if (listed.status !== 0) {
    return null;
  }
  const tags: Array<{ name: string; version: Semver }> = [];
  for (const name of lines(listed.stdout)) {
    const version = parse(name);
    if (version !== null) {
      tags.push({ name, version });
    }
  }
  tags.sort((left, right) => compare(right.version, left.version));

  for (const { name } of tags) {
    if (contains(git, root, name)) {
      return name;
    }
    const source = builtFrom(git, root, name);
    if (source !== null && contains(git, root, source)) {
      return name;
    }
  }
  return null;
}

/** Trailers naming the commit a published tree was built from, preferred first. */
const SOURCE_TRAILERS = ['Source-Commit', 'Workflow-Commit'];

/** The commit a tag's built tree came from, by its trailer, or null where it names none. */
function builtFrom(git: Git, root: string, tag: string): string | null {
  const body = git(root, ['log', '-1', '--format=%B', tag]);
  if (body.status !== 0) {
    return null;
  }
  for (const name of SOURCE_TRAILERS) {
    const found = new RegExp(`^${name}:\\s*<?\\S*?([0-9a-f]{40})>?\\s*$`, 'm').exec(body.stdout);
    if (found) {
      return found[1]!;
    }
  }
  return null;
}

function contains(git: Git, root: string, commit: string): boolean {
  return git(root, ['merge-base', '--is-ancestor', commit, 'HEAD']).status === 0;
}
