/**
 * Combines the multiline input with the singular convenience input.
 * Empty values are discarded and duplicates keep their first position.
 */
export function collectTags(tags: string[], tag: string): string[] {
  const unique = new Set<string>();

  for (const value of [...tags, tag]) {
    const trimmed = value.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }

  return [...unique];
}
