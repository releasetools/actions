import { type Git, lines } from './git';
import type { Part } from './semver';

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
  remove: { part: 'major', section: 'Removed' },
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
 */
export function requiredIncrement(changes: readonly Change[]): Part | null {
  const rank: Record<Part, number> = { patch: 1, minor: 2, major: 3 };
  let largest: Part | null = null;

  for (const change of changes) {
    const part = change.breaking ? 'major' : (change.type ? TYPES[change.type]?.part ?? null : null);
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

/** The newest tag matching a shape that is reachable from the commit being judged. */
export function newestReachableTag(git: Git, root: string, match: string): string | null {
  const described = git(root, ['describe', '--tags', '--abbrev=0', '--match', match, 'HEAD']);
  if (described.status !== 0) {
    return null;
  }
  const [tag] = lines(described.stdout);
  return tag ?? null;
}
