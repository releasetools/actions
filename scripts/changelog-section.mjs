import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

/**
 * One version's section of a changelog, between its `## <version>` heading and
 * the next one.
 *
 * The release workflow asks twice: once to refuse a version nothing describes,
 * and once for the lines to publish as the release notes. Both go through
 * here, so the file and the release page cannot say different things about a
 * version.
 *
 *     node scripts/changelog-section.mjs 0.1.1
 *
 * The heading is matched the way release-guard matches one, so a changelog
 * this passes is a changelog that passes the check: dated or bare, with or
 * without a `v`, and with or without the brackets Keep a Changelog puts round
 * a version.
 */
export function section(text, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s+\\[?v?${escaped}\\]?(\\s|$)`);

  const lines = text.split('\n');
  const from = lines.findIndex((line) => heading.test(line));
  if (from === -1) {
    return '';
  }

  const rest = lines.slice(from + 1);
  const next = rest.findIndex((line) => line.startsWith('## '));
  return (next === -1 ? rest : rest.slice(0, next)).join('\n').trim();
}

// Run directly, rather than imported by a test.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const { values, positionals } = parseArgs({
    options: { file: { type: 'string' } },
    allowPositionals: true,
  });
  const version = positionals[0];
  const file = values.file ?? 'CHANGELOG.md';

  if (!version) {
    process.stderr.write('changelog-section: which version? e.g. 0.1.1\n');
    process.exit(2);
  }

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    process.stderr.write(`changelog-section: cannot read ${file}: ${error.message}\n`);
    process.exit(2);
  }

  const found = section(text, version);
  if (found === '') {
    process.stderr.write(`changelog-section: ${file} has no section for ${version}\n`);
    process.exit(2);
  }
  process.stdout.write(`${found}\n`);
}
