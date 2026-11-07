/** An entry of a recursive tree listing, as GitHub's Trees API returns it. */
export interface TreeEntry {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
}

/**
 * One line per path whose entry differs between two recursive tree listings,
 * sorted by path. Directories are skipped, since the entries inside them say
 * what differs.
 */
export function treeDifferences(source: TreeEntry[], mirror: TreeEntry[]): string[] {
  const from = entriesByPath(source);
  const to = entriesByPath(mirror);
  const lines: Array<[string, string]> = [];
  for (const [path, entry] of from) {
    const other = to.get(path);
    if (other === undefined) {
      lines.push([path, `- ${path} is missing from the mirror`]);
    } else if (other !== entry) {
      lines.push([path, `~ ${path} is ${entry} in the source and ${other} in the mirror`]);
    }
  }
  for (const path of to.keys()) {
    if (!from.has(path)) {
      lines.push([path, `+ ${path} is not in the source`]);
    }
  }
  return lines.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, line]) => line);
}

function entriesByPath(entries: TreeEntry[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of entries) {
    if (entry.path && entry.type !== 'tree') {
      files.set(entry.path, `${entry.mode} ${entry.sha}`);
    }
  }
  return files;
}
