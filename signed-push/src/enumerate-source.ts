import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type FileMode = '100644' | '100755';

export interface Addition {
  /** Forward-slash path relative to the source-dir root. */
  path: string;
  /** Base64-encoded file contents, ready to send as a blob. */
  contents: string;
  /** 100755 when any execute bit is set on the source file, 100644 otherwise. */
  mode: FileMode;
  /** The git blob SHA of the contents, for comparing against the target tree. */
  sha: string;
}

/**
 * Walks a directory recursively and returns every regular file with its
 * contents, mode and blob SHA. The .git directory is always skipped. Output is
 * sorted by path so the same input produces the same commit on every run.
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
      const stat = await fs.stat(full);
      out.push({
        path: rel,
        contents: buf.toString('base64'),
        mode: stat.mode & 0o111 ? '100755' : '100644',
        sha: blobSha(buf),
      });
    }
    // Anything that isn't a regular file or directory (symlinks, devices)
    // gets skipped silently.
  }
}

/** The SHA git gives a blob with these bytes: sha1 of "blob <size>\0<bytes>". */
export function blobSha(buf: Buffer): string {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}
