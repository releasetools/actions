/**
 * The glob dialect both the module patterns and the ignore patterns speak.
 *
 * `*` and `?` match inside one path segment, `**` matches across segments.
 * That is enough for `plugins/*`, `*.md` and `docs/**`, and small enough to
 * read in one sitting, which a dependency would not be.
 */

/** Whether a pattern needs expanding, or is just a path. */
export function isGlob(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

/** Drops a leading `./`, and slashes at either end. */
export function normalise(pattern: string): string {
  return pattern
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/** One segment's glob as a regex fragment, matching no `/`. */
export function segmentPattern(segment: string): string {
  return segment
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '[^/]');
}

/** A whole pattern as a regex fragment, with `**` free to cross segments. */
export function pathPattern(pattern: string): string {
  return normalise(pattern)
    .split('/')
    .map((segment) => (segment === '**' ? '.*' : segmentPattern(segment)))
    .join('/');
}
