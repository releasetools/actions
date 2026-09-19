/**
 * Semantic versions, compared the way https://semver.org/spec/v2.0.0.html
 * says to compare them.
 *
 * A version is a promise about compatibility, and the only reason a range, a
 * lockfile or a person in a hurry can read one is that everybody agreed what
 * the parts mean. Reading them approximately is how `0.2.0-rc1` comes out
 * equal to `0.2.0`, and a release candidate looks like the release.
 */
export interface Semver {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated identifiers after the `-`, empty for a release. */
  prerelease: readonly string[];
}

/** The pattern from the specification, without its build metadata capture. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

/** The version, or null when it is not one. A leading `v` is a tag's, and is dropped. */
export function parse(version: string): Semver | null {
  const match = SEMVER.exec(version.trim().replace(/^v/, ''));
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
  };
}

/**
 * Negative when `left` is older, positive when newer, zero when the same
 * version. Build metadata is ignored, which is what the specification says:
 * two versions differing only after a `+` are the same version.
 */
export function compare(left: Semver, right: Semver): number {
  for (const [one, two] of [
    [left.major, right.major],
    [left.minor, right.minor],
    [left.patch, right.patch],
  ] as const) {
    if (one !== two) {
      return one < two ? -1 : 1;
    }
  }

  // A release outranks any pre-release of itself, and has none to compare.
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) {
      return 0;
    }
    return left.prerelease.length === 0 ? 1 : -1;
  }

  const shorter = Math.min(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < shorter; index++) {
    const order = compareIdentifiers(left.prerelease[index]!, right.prerelease[index]!);
    if (order !== 0) {
      return order;
    }
  }
  // Everything matched, so the one with more identifiers is the larger.
  return left.prerelease.length - right.prerelease.length;
}

/**
 * Numeric identifiers compare numerically, alphanumeric ones in ASCII order,
 * and a numeric identifier always has lower precedence than an alphanumeric
 * one. That is what puts `alpha.1` before `alpha.beta`.
 */
function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    const one = Number(left);
    const two = Number(right);
    return one === two ? 0 : one < two ? -1 : 1;
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return left === right ? 0 : left < right ? -1 : 1;
}

/** Which part of a version a change moves. */
export type Part = 'major' | 'minor' | 'patch';

/**
 * The version that follows `from` by incrementing `part`.
 *
 * Under `0.y.z` a major increments the minor instead, because semver's "anything
 * may change" is a rule for publishers and no help to anybody depending on one:
 * it keeps `^0.4.2` meaning what a reader expects while the leading zero lasts.
 * A pre-release is dropped, since `1.2.3-rc.1` incremented by a patch is
 * `1.2.4`, not another candidate.
 */
export function increment(from: Semver, part: Part): Semver {
  const next = (major: number, minor: number, patch: number): Semver => ({
    major,
    minor,
    patch,
    prerelease: [],
  });

  if (part === 'major') {
    return from.major === 0
      ? next(0, from.minor + 1, 0)
      : next(from.major + 1, 0, 0);
  }
  if (part === 'minor') {
    return next(from.major, from.minor + 1, 0);
  }
  return next(from.major, from.minor, from.patch + 1);
}

/** The version as it is written. */
export function format(version: Semver): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length === 0 ? core : `${core}-${version.prerelease.join('.')}`;
}
