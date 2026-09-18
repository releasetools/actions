import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

/**
 * Assembles the npm package for changelog-guard's CLI.
 *
 * The release workflow runs this, and so does anybody publishing by hand: npm
 * cannot create a package through OIDC, so a name's first version is published
 * from somebody's machine and every later one by the workflow. Both have to
 * produce the same bytes, which is why this is a script rather than a heredoc
 * inside release.yml.
 *
 *     npm run build:changelog-guard-cli
 *     node scripts/package-npm.mjs --version 0.1.0
 *     node npm/changelog-guard.js          # exits 2, which is the smoke test
 *     npm publish npm --access public
 */
const BUNDLE = 'changelog-guard/dist-cli/index.js';

export function packageNpm({ root = process.cwd(), out = 'npm', version } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    throw new Error(`version must look like 0.1.0, got "${version ?? ''}"`);
  }

  const source = path.resolve(root);
  const target = path.resolve(source, out);
  const bundle = path.join(source, BUNDLE);
  if (!fs.existsSync(bundle)) {
    throw new Error(`missing ${BUNDLE}; run \`npm run build:changelog-guard-cli\` first`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'));
  fs.copyFileSync(
    path.join(source, 'changelog-guard/README.md'),
    path.join(target, 'README.md'),
  );

  // ncc emits no shebang, and npm needs one on a bin.
  const bin = path.join(target, 'changelog-guard.js');
  fs.writeFileSync(bin, `#!/usr/bin/env node\n${fs.readFileSync(bundle, 'utf8')}`);
  fs.chmodSync(bin, 0o755);

  fs.writeFileSync(
    path.join(target, 'package.json'),
    `${JSON.stringify(
      {
        name: '@releasetools/changelog-guard',
        version,
        description: 'Fail a pull request when a module changed without recording it in its changelog.',
        license: 'Apache-2.0',
        repository: { type: 'git', url: 'git+https://github.com/releasetools/actions.git' },
        homepage:
          'https://github.com/releasetools/actions/tree/main/changelog-guard#readme',
        bugs: { url: 'https://github.com/releasetools/actions/issues' },
        bin: { 'changelog-guard': 'changelog-guard.js' },
        engines: { node: '>=20' },
        files: ['changelog-guard.js', 'README.md', 'LICENSE'],
      },
      null,
      2,
    )}\n`,
  );

  return { target, version };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const { values } = parseArgs({
    options: { root: { type: 'string' }, out: { type: 'string' }, version: { type: 'string' } },
  });

  try {
    const { target, version } = packageNpm(values);
    process.stdout.write(`Packaged @releasetools/changelog-guard ${version} into ${target}\n`);
  } catch (error) {
    process.stderr.write(`package-npm: ${error.message}\n`);
    process.exit(2);
  }
}
