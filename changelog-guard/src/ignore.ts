import { pathPattern } from './glob';

/**
 * Decides which changed files do not count as the module changing.
 *
 * A pattern matches the end of a path, on segment boundaries, so `README.md`
 * matches at every depth and `docs/README.md` only inside a `docs`. That is
 * what makes one entry enough for a file that appears once per module. Add
 * globs for the rest: `*.md` for a kind of file, `docs/**` for a subtree.
 *
 * Matching is case-insensitive unless the caller says otherwise, because
 * README.md, ReadMe.md and readme.md are the same file to the person who
 * wrote the pattern, and on macOS they are the same file to git.
 */
export function ignoreMatcher(
  patterns: readonly string[],
  caseSensitive = false,
): (file: string) => boolean {
  const expressions = patterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern !== '')
    .map(
      (pattern) => new RegExp(`(?:^|/)${pathPattern(pattern)}$`, caseSensitive ? '' : 'i'),
    );

  if (expressions.length === 0) {
    return () => false;
  }
  return (file) => expressions.some((expression) => expression.test(file));
}
