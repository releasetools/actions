/** A repository named the way an `owner/repo` input names it. */
export interface Repository {
  owner: string;
  repo: string;
}

/** Splits an `owner/repo` input, refusing anything that is not two non-empty halves. */
export function parseRepository(input: string, value: string): Repository {
  const [owner, repo, ...rest] = value.split('/');
  if (!owner || !repo || rest.length > 0) {
    throw new Error(`${input} must be "owner/repo", got "${value}"`);
  }
  return { owner, repo };
}
