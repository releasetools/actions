/**
 * Reading a changelog, shared by every action in this repository that has to.
 *
 * One heading rule in one place: `release-guard` asks whether a section exists
 * for a version, and `changelog-section` hands the lines under it to whatever
 * publishes the release. Two readers would be two answers to "is this release
 * written down", and the pair that disagrees is the one nobody notices.
 */

/**
 * The heading a version's section opens with.
 *
 * Dated or bare, with or without a `v`, and with or without the brackets Keep
 * a Changelog puts round a version so it can be linked.
 */
function heading(version: string): RegExp {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^##\\s+\\[?v?${escaped}\\]?(\\s|$)`);
}

/** Whether a changelog opens a section for this version. */
export function carries(text: string, version: string): boolean {
  return text.split('\n').some((line) => heading(version).test(line));
}

/** The lines under that heading, up to the next one, or empty for no section. */
export function section(text: string, version: string): string {
  const lines = text.split('\n');
  const opens = heading(version);
  const from = lines.findIndex((line) => opens.test(line));
  if (from === -1) {
    return '';
  }

  const rest = lines.slice(from + 1);
  const next = rest.findIndex((line) => line.startsWith('## '));
  return (next === -1 ? rest : rest.slice(0, next)).join('\n').trim();
}
