import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The repository root, with every link on the way to it followed.
 *
 * Containment is decided by comparing real paths, so the root has to be one
 * too, or a checkout that sits behind a symlink puts everything "outside".
 */
export function realRoot(root: string): string {
  try {
    return fs.realpathSync(path.resolve(root));
  } catch {
    return path.resolve(root);
  }
}

/** What a path inside the repository resolves to, and whether it is still inside. */
export type Resolved = { real: string } | 'absent' | 'outside';

/**
 * Resolves a repository-relative path and refuses anything that leaves.
 *
 * The working tree is written by whoever opened the pull request, so a file
 * this reads can be a link to somewhere on the runner: a token, a key, a
 * config. It reads versions out of files and prints them, so following one is
 * enough to publish what it found. Every path is resolved through its links
 * and checked against the root before anything is opened.
 */
export function inside(root: string, relative: string): Resolved {
  const candidate = path.resolve(root, relative);
  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    return 'absent';
  }

  const from = path.relative(root, real);
  if (from !== '' && (from === '..' || from.startsWith(`..${path.sep}`) || path.isAbsolute(from))) {
    return 'outside';
  }
  return { real };
}
