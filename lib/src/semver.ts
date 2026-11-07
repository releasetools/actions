/**
 * Semantic versions, compared the way https://semver.org/spec/v2.0.0.html
 * says to compare them.
 *
 * A version is a promise about compatibility, and the only reason a range, a
 * lockfile or a person in a hurry can read one is that everybody agreed what
 * the parts mean. Reading them approximately is how `0.2.0-rc1` comes out
 * equal to `0.2.0`, and a release candidate looks like the release.
 */
export type { Semver } from '../../packages/config/releasetools-config';
import { compareVersions, parseVersion } from '../../packages/config/releasetools-config';
import type { Semver } from '../../packages/config/releasetools-config';

/** The version, or null when it is not one. A leading `v` is a tag's, and is dropped. */
export const parse: (version: string) => Semver | null = parseVersion;

/**
 * Negative when `left` is older, positive when newer, zero when the same
 * version. Build metadata is ignored. Both live in @releasetools/config, so
 * the guards and the release-notes plugin order versions the same way.
 */
export const compare: (left: Semver, right: Semver) => number = compareVersions;

export type Part = 'minor' | 'patch';

/**
 * The version that follows `from` by incrementing `part`.
 *
 * A pre-release is dropped. Nothing increments a pre-release baseline:
 * what follows `1.2.3-rc.1` is a later candidate for 1.2.3 or 1.2.3 itself,
 * which `followsPrerelease` decides.
 */
export function increment(from: Semver, part: Part): Semver {
  const next = (major: number, minor: number, patch: number): Semver => ({
    major,
    minor,
    patch,
    prerelease: [],
  });

  if (part === 'minor') {
    return next(from.major, from.minor + 1, 0);
  }
  return next(from.major, from.minor, from.patch + 1);
}

/**
 * Whether `version` may follow the pre-release `baseline`: a later
 * pre-release of the same version, or that version itself. After
 * `1.0.0-rc.1` comes `1.0.0-rc.2` or `1.0.0`, whatever the changes in
 * between were, since they are all on the way to 1.0.0.
 */
export function followsPrerelease(baseline: Semver, version: Semver): boolean {
  return (
    version.major === baseline.major &&
    version.minor === baseline.minor &&
    version.patch === baseline.patch &&
    compare(version, baseline) > 0
  );
}

/** The version as it is written. */
export function format(version: Semver): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length === 0 ? core : `${core}-${version.prerelease.join('.')}`;
}
