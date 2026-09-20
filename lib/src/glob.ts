/**
 * The glob dialect for ignore patterns.
 *
 * `*` and `?` match inside one path segment, `**` matches across segments.
 */

/** Drops a leading `./`, and slashes at either end. */
export function normalise(pattern: string): string {
  return pattern
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/** One segment's glob as a regex fragment, matching no `/`. */
function segmentPattern(segment: string): string {
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
