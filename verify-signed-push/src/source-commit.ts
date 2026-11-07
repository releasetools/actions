import type { Repository } from '../../lib/src/repository';

/**
 * The source commit a published commit names in its one `Source-Commit`
 * trailer, written the way traceable-tag writes it:
 * `Source-Commit: <{server}/{owner}/{repo}/commit/{sha}>`.
 *
 * `@releasetools/config` reads the same trailer leniently, because it only asks
 * where a release happened. This answers whether a claim holds, so it refuses
 * a second trailer, a trailer naming another repository, and anything short
 * of a full SHA.
 */
export function sourceCommitOf(message: string, serverUrl: string, source: Repository): string {
  const trailers = message.split(/\r?\n/).filter((line) => /^source-commit\s*:/i.test(line));
  if (trailers.length !== 1) {
    throw new Error(`the commit needs exactly one Source-Commit trailer, and has ${trailers.length}`);
  }
  const trailer = trailers[0]!.trimEnd();
  const repository = `${serverUrl}/${source.owner}/${source.repo}`;
  const found = /^Source-Commit: <(.+)\/commit\/([0-9a-f]{40})>$/.exec(trailer);
  if (!found || found[1]!.toLowerCase() !== repository.toLowerCase()) {
    throw new Error(`the trailer must read "Source-Commit: <${repository}/commit/<full SHA>>", not "${trailer}"`);
  }
  return found[2]!;
}
