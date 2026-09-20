const path = require('node:path');

/**
 * The version a manifest declares, whichever kind of manifest it is.
 *
 * The kind comes from the filename, because that is what every ecosystem
 * already agrees on: Cargo.toml is TOML wherever it sits. Each reader is a few
 * lines over the one construct that holds a version, rather than a parser for
 * the whole format, so the cost of a new ecosystem is a case rather than a
 * dependency.
 *
 * Errors read as the rest of the sentence after the file's name, so the caller
 * can say `packages/api/Cargo.toml declares no version`.
 */
function versionFrom(file, text) {
  switch (path.extname(path.basename(file)).toLowerCase()) {
    case '.json':
      return fromJson(text);
    case '.toml':
      return fromToml(text);
    case '.yaml':
    case '.yml':
      return fromYaml(text);
    case '.properties':
      return fromProperties(text);
    case '.xml':
      throw new Error(
        'is XML, which this does not read: a <version> can be the project’s or ' +
          'its parent’s, and guessing wrong is worse than not guessing. Point at a ' +
          'file that states one version',
      );
    default:
      return fromPlainText(text);
  }
}

/** package.json, composer.json, deno.json, plugin.json: a top-level string. */
function fromJson(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (err) {
    throw new Error(`is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return checked(manifest?.version);
}

/**
 * Cargo.toml, pyproject.toml: the version of the table that owns one.
 *
 * Tracked by table rather than taken by regex, because a `version` under
 * `[dependencies]` is some other project's and is the wrong answer rather
 * than no answer.
 */
function fromToml(text) {
  const owners = ['package', 'project', 'tool.poetry', 'workspace.package'];
  const found = new Map();

  let table = '';
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed.startsWith('[[')) {
      // An array of tables holds repeated things, never the project's version.
      table = '\0';
      continue;
    }
    const heading = /^\[([^\]]+)\]/.exec(trimmed);
    if (heading) {
      table = heading[1].trim();
      continue;
    }
    const assignment = /^version\s*=\s*(.+)$/.exec(trimmed);
    if (assignment && !found.has(table)) {
      found.set(table, value(assignment[1]));
    }
  }

  for (const owner of [...owners, '']) {
    const version = found.get(owner);
    if (version !== undefined && version !== '') {
      return version;
    }
  }
  throw new Error('declares no version');
}

/** Chart.yaml, pubspec.yaml: a top-level key, so never an indented one. */
function fromYaml(text) {
  for (const line of text.split('\n')) {
    const match = /^version\s*:\s*(.+)$/.exec(line);
    if (match) {
      return checked(value(match[1]));
    }
  }
  throw new Error('declares no version');
}

/** gradle.properties, and anything else shaped like it. */
function fromProperties(text) {
  for (const line of text.split('\n')) {
    const match = /^\s*version\s*[=:]\s*(.+)$/.exec(line);
    if (match) {
      return checked(value(match[1]));
    }
  }
  throw new Error('declares no version');
}

/** A VERSION file, which is the version and nothing else. */
function fromPlainText(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  if (lines.length !== 1) {
    throw new Error(
      lines.length === 0
        ? 'declares no version'
        : 'holds more than a version, so it is not a file this can read',
    );
  }
  return checked(value(lines[0]));
}

/** A declared value: quoted, or bare up to a comment. */
function value(raw) {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const end = trimmed.indexOf(quote, 1);
    return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
  }
  const comment = trimmed.indexOf('#');
  return (comment === -1 ? trimmed : trimmed.slice(0, comment)).trim();
}

function checked(version) {
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('declares no version');
  }
  return version.trim();
}

module.exports = { versionFrom };
