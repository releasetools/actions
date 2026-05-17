import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface Addition {
  /** Forward-slash path relative to the source-dir root. */
  path: string;
  /** Base64-encoded file contents, ready to send as additions[].contents. */
  contents: string;
}

/**
 * Walks a directory recursively and returns every regular file as a GraphQL
 * FileAddition. The .git directory is always skipped. Output is sorted by
 * path so the same input produces the same commit on every run.
 */
export async function enumerateSource(sourceDir: string): Promise<Addition[]> {
  const out: Addition[] = [];
  await walk(sourceDir, sourceDir, out);
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

async function walk(dir: string, base: string, out: Addition[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`source-dir does not exist: ${dir}`);
    }
    throw err;
  }
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, base, out);
    } else if (entry.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join('/');
      const buf = await fs.readFile(full);
      out.push({ path: rel, contents: buf.toString('base64') });
    }
    // Anything that isn't a regular file or directory (symlinks, devices)
    // gets skipped silently. createCommitOnBranch only accepts regular
    // file contents.
  }
}
