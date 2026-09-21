#!/usr/bin/env node
/*
 * Adopt the releasetools conventions in a repository.
 *
 * Writes a starter `.releasetools.yaml` and prints plugin installation commands.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG_FILE, settingsFrom } = require('./releasetools-config');
const { versionFrom } = require('./version');

const USAGE = 'npx @releasetools/config adopt [--dir <path>] [--plugin <name>@<marketplace>]...';

/** Marketplace repositories used in the printed installation commands. */
const MARKETPLACES = {
  'release-tools': 'releasetools/agent-plugins',
  mihaibojin: 'MihaiBojin/agent-plugins',
};

const DEFAULT_PLUGINS = ['release-notes@release-tools', 'release@release-tools'];

/** The manifests a starter declaration can name, in the order they are tried. */
const MANIFESTS = [
  'package.json',
  'composer.json',
  'deno.json',
  'pyproject.toml',
  'Cargo.toml',
  'pubspec.yaml',
  'Chart.yaml',
  'gradle.properties',
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  'VERSION',
  'version.txt',
];

const HEADER = `# How this repository releases, read by every releasetools tool.
#
# Conventions: https://github.com/releasetools/conventions
# Tools:       https://github.com/releasetools
`;

/**
 * The command each ecosystem ships for setting a version, by the manifest that
 * names it. Nothing here parses or rewrites a manifest, so a project that
 * keeps its version somewhere none of these know sets it by hand.
 */
const BUMPS = {
  'package.json': 'npm version {version} --no-git-tag-version',
  'deno.json': 'deno run -A jsr:@deno/bump {version}',
  'pyproject.toml': 'uv version {version}',
  'Cargo.toml': 'cargo set-version {version}',
  'pubspec.yaml': 'dart pub version {version}',
};

function main(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(USAGE);
    return argv.length === 0 ? 1 : 0;
  }
  if (argv[0] !== 'adopt') {
    throw new Error(`unknown command '${argv[0]}'; use ${USAGE}`);
  }
  const options = read(argv.slice(1));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const commands = declare(options.plugins);
  const root = repositoryRoot(options.dir);
  console.log(writeConfig(root));
  console.log('');
  console.log(commands);
  return 0;
}

function read(argv) {
  const options = { dir: process.cwd(), plugins: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--dir' || argument === '--plugin') {
      const value = argv[++index];
      if (!value || value.startsWith('-')) {
        throw new Error(`${argument} needs a value`);
      }
      if (argument === '--dir') {
        options.dir = value;
      } else {
        options.plugins.push(value);
      }
    } else {
      throw new Error(`unknown argument '${argument}'`);
    }
  }
  if (options.plugins.length === 0) {
    options.plugins = DEFAULT_PLUGINS;
  }
  return options;
}

function repositoryRoot(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error(`${path.resolve(dir)} is not in a git repository`);
  }
}

/**
 * How a release is cut, as far as a starter can honestly say.
 *
 * Only `branch` and `merge` have defaults worth writing down, and they are
 * written as themselves rather than left out, because the next reader is
 * deciding whether to change them. The three that name something in this
 * repository are commented, with the workflows found here listed beside them:
 * a guess at which one publishes is worse than a line somebody has to fill in.
 */
function releaseBlock(root) {
  let workflows = [];
  try {
    workflows = fs
      .readdirSync(path.join(root, '.github', 'workflows'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    // A repository with no workflows is a repository with nothing to name.
  }

  const found = workflows.length === 0 ? 'none here' : workflows.join(', ');
  return [
    '',
    'release:',
    '  branch: main',
    '  merge: squash',
    `  # The workflows here: ${found}`,
    '  # checks: the one that must be green on the commit a tag will name',
    '  # publish: the one a tag starts',
    '  # registry: a URL answering 404 for a version nobody has released,',
    '  #           with {version} where the version goes',
  ];
}

/** A starter declaration, describing what is actually in the repository. */
function writeConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (fs.existsSync(file)) {
    return `${CONFIG_FILE} is already there`;
  }

  const found = [];
  const skipped = [];
  for (const name of MANIFESTS) {
    const candidate = path.join(root, name);
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const text = fs.readFileSync(candidate, 'utf8');
    try {
      found.push({ name, version: versionFrom(name, text) });
    } catch (error) {
      skipped.push(`${name} ${error.message}`);
    }
  }

  const changelog = fs.existsSync(path.join(root, 'CHANGELOG.md')) ? 'CHANGELOG.md' : null;
  const lines = [HEADER, 'projects:', '  - path: ./'];
  if (found.length === 1) {
    lines.push(`    manifest: ${found[0].name}`);
  } else if (found.length > 1) {
    lines.push('    manifest:');
    for (const { name } of found) {
      lines.push(`      - ${name}`);
    }
  } else {
    // A project says where its version lives, so there is nothing to write
    // but a placeholder and the reason it is one.
    lines.push('    # No file here declares a version. Name the one that will,');
    lines.push('    # or create this one holding the version and nothing else.');
    lines.push('    manifest: VERSION');
  }
  if (changelog) {
    lines.push(`    changelog: ${changelog}`);
  }
  const bump = found.map((entry) => BUMPS[entry.name]).find((command) => command);
  if (bump) {
    lines.push(`    bump: ${bump}`);
  }
  lines.push(...releaseBlock(root));
  lines.push('', 'conventions:', '  except: []', '');
  const text = lines.join('\n');
  settingsFrom(text);
  fs.writeFileSync(file, text, { flag: 'wx' });

  const report = [`wrote ${CONFIG_FILE}`];
  for (const reason of skipped) {
    report.push(`  skipped ${reason}`);
  }
  if (found.length === 0) {
    report.push('  no file here declares a version, so VERSION is named as a placeholder');
    report.push('  name the file that carries it, or create that one');
  }
  const versions = [...new Set(found.map(({ version }) => version))];
  if (versions.length > 1) {
    report.push(`  they disagree: ${found.map(({ name, version }) => `${name} says ${version}`).join(', ')}`);
    report.push('  every manifest one project names has to declare the same version');
  }
  return report.join('\n');
}

/** Prints plugin commands, with Claude installations scoped to the project. */
function declare(plugins) {
  const marketplaces = [...new Set(plugins.map(named))];
  const lines = ['Declare the plugins, in the repository, with:', ''];
  for (const marketplace of marketplaces) {
    lines.push(`  claude plugin marketplace add ${MARKETPLACES[marketplace]} --scope project`);
  }
  for (const plugin of plugins) {
    lines.push(`  claude plugin install ${plugin} --scope project`);
  }
  lines.push('', 'Codex keeps its plugins in its own configuration rather than the', "repository's:", '');
  for (const plugin of plugins) {
    lines.push(`  codex plugin add ${plugin}`);
  }
  return lines.join('\n');
}

function named(plugin) {
  if (!/^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$/i.test(plugin)) {
    throw new Error(`'${plugin}' must be <name>@<marketplace>`);
  }
  const marketplace = plugin.split('@')[1];
  if (!Object.hasOwn(MARKETPLACES, marketplace)) {
    throw new Error(
      `marketplace '${marketplace}' is not one this knows; the names are ${Object.keys(MARKETPLACES).join(', ')}`,
    );
  }
  return marketplace;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`config: ${error.message}`);
  process.exitCode = 1;
}
