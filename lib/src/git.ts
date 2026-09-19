import { spawnSync } from 'node:child_process';

/** One git invocation: how it exited, and what it wrote. */
export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs git inside a working directory. The tests inject their own. */
export type Git = (cwd: string, args: string[]) => GitResult;

export function spawnGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function lines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Where the branch forked from what it is being compared against, which is
 * the diff GitHub shows under Files changed.
 *
 * Against a branch tip instead, anything the base gained since the fork reads
 * as this branch's change, backwards.
 */
export function forkPoint(git: Git, root: string, base: string): string {
  const forked = git(root, ['merge-base', base, 'HEAD']);
  return forked.status === 0 && forked.stdout.trim() !== '' ? forked.stdout.trim() : base;
}
