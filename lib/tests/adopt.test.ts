import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { settingsFrom } from '../../packages/config/releasetools-config';

describe('the published config CLI', () => {
  let installation: string;
  let cli: string;
  let environment: NodeJS.ProcessEnv;
  const roots: string[] = [];

  beforeAll(() => {
    installation = fs.mkdtempSync(path.join(os.tmpdir(), 'config-package-'));
    environment = { ...process.env, npm_config_cache: path.join(installation, 'cache') };
    const packed = execFileSync('npm', [
      'pack', '--json', '--ignore-scripts', '--offline', '--pack-destination', installation,
    ], {
      cwd: path.resolve(__dirname, '../../packages/config'),
      env: environment,
      encoding: 'utf8',
    });
    const tarball = path.join(installation, JSON.parse(packed)[0].filename);
    fs.writeFileSync(path.join(installation, 'package.json'), '{"private":true}\n');
    execFileSync('npm', [
      'install', tarball, '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
      '--package-lock=false',
    ], { cwd: installation, env: environment, stdio: 'pipe' });
    cli = path.join(installation, 'node_modules/@releasetools/config/cli.js');
  }, 30_000);

  afterAll(() => {
    fs.rmSync(installation, { recursive: true, force: true });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function directory(): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'config adopt-')));
    roots.push(root);
    return root;
  }

  function repository(files: Record<string, string> = {}): string {
    const root = directory();
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    return root;
  }

  function run(root: string, ...args: string[]) {
    return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  }

  function declared(root: string) {
    return settingsFrom(fs.readFileSync(path.join(root, '.releasetools.yaml'), 'utf8'));
  }

  it('runs through npx and keeps the package reader importable', () => {
    const root = repository({ 'package.json': '{"version":"1.2.3"}', 'CHANGELOG.md': '# Changes\n' });
    const output = execFileSync('npx', [
      '--offline', '@releasetools/config', 'adopt', '--dir', root,
    ], { cwd: installation, env: environment, encoding: 'utf8' });

    expect(output).toContain('wrote .releasetools.yaml');
    expect(declared(root).projects).toEqual([
      {
        path: ['./'],
        manifest: ['package.json'],
        changelog: 'CHANGELOG.md',
        bump: 'npm version {version} --no-git-tag-version',
      },
    ]);
    const requirePackage = createRequire(path.join(installation, 'package.json'));
    const reader = requirePackage('@releasetools/config');
    const declaration = 'projects:\n  - path: ./\n    manifest: package.json';
    expect(reader.settingsFrom(declaration)).toEqual(settingsFrom(declaration));
    const metadata = JSON.parse(fs.readFileSync(path.join(path.dirname(cli), 'package.json'), 'utf8'));
    expect(metadata.dependencies ?? {}).toEqual({});
    expect(metadata.main).toBe('./releasetools-config.js');
    expect(metadata.exports).toEqual({
      '.': { types: './releasetools-config.d.ts', default: './releasetools-config.js' },
    });
  });

  it('writes at the git root when invoked in a subdirectory', () => {
    const root = repository({ 'package.json': '{"version":"1.0.0"}', 'src/file': '' });
    const result = run(path.join(root, 'src'), 'adopt');

    expect(result.status).toBe(0);
    expect(declared(root).projects[0]?.manifest).toEqual(['package.json']);
    expect(fs.existsSync(path.join(root, 'src/.releasetools.yaml'))).toBe(false);
  });

  it.each([
    ['package.json', '{"version":"1.2.3"}'],
    ['composer.json', '{"version":"1.2.3"}'],
    ['deno.json', '{"version":"1.2.3"}'],
    ['pyproject.toml', '[project]\nversion = "1.2.3"'],
    ['pyproject.toml', '[tool.poetry]\nversion = "1.2.3"'],
    ['Cargo.toml', '[package]\nversion = "1.2.3"'],
    ['Cargo.toml', '[workspace.package]\nversion = "1.2.3"'],
    ['pubspec.yaml', 'version: "1.2.3" # comment'],
    ['Chart.yaml', 'version: 1.2.3'],
    ['gradle.properties', 'version = 1.2.3'],
    ['.claude-plugin/plugin.json', '{"version":"1.2.3"}'],
    ['.codex-plugin/plugin.json', '{"version":"1.2.3"}'],
    ['VERSION', '# Release\n1.2.3\n'],
    ['version.txt', '1.2.3\n'],
  ])('names the version in %s', (file, text) => {
    const root = repository({ [file]: text });

    expect(run(root, 'adopt').status).toBe(0);
    const [group] = declared(root).projects;
    expect(group?.path).toEqual(['./']);
    expect(group?.manifest).toEqual([file]);
  });

  it('names all manifests and reports different versions', () => {
    const root = repository({ 'package.json': '{"version":"1.2.3"}', VERSION: '2.0.0' });
    const result = run(root, 'adopt');

    expect(result.status).toBe(0);
    expect(declared(root).projects[0]?.manifest).toEqual(['package.json', 'VERSION']);
    expect(result.stdout).toContain('they disagree: package.json says 1.2.3, VERSION says 2.0.0');
  });

  it('skips files the shared manifest reader cannot read', () => {
    const root = repository({
      'package.json': '{"version":42}',
      'composer.json': '{bad json',
      'Cargo.toml': '[dependencies]\nversion = "9.9.9"',
      'Chart.yaml': 'dependencies:\n  version: 9.9.9',
      VERSION: '1.2.3\nand another line',
    });
    const result = run(root, 'adopt');

    expect(result.status).toBe(0);
    expect(declared(root).projects).toEqual([{ path: ['./'], manifest: ['VERSION'] }]);
    expect(result.stdout).toContain('skipped package.json declares no version');
    expect(result.stdout).toContain('skipped composer.json is not valid JSON');
    expect(result.stdout).toContain('no file here declares a version');
  });

  it('names a placeholder manifest where nothing declares a version', () => {
    const root = repository();

    const result = run(root, 'adopt');

    // A project says where its version lives, so the starter says where it
    // would be and why that file is not there yet.
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no file here declares a version');
    expect(declared(root).projects).toEqual([{ path: ['./'], manifest: ['VERSION'] }]);
    expect(declared(root).except).toEqual([]);
  });

  it('preserves an existing configuration byte for byte', () => {
    const contents = '# Custom declaration\nprojects:\n  - path: docs\n';
    const root = repository({ '.releasetools.yaml': contents, 'package.json': '{bad json' });
    const result = run(root, 'adopt');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('.releasetools.yaml is already there');
    expect(fs.readFileSync(path.join(root, '.releasetools.yaml'), 'utf8')).toBe(contents);
  });

  it('prints the default plugin commands without running them', () => {
    const root = repository();
    const result = run(root, 'adopt');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('claude plugin marketplace add releasetools/agent-plugins --scope project');
    expect(result.stdout).toContain('claude plugin install release-notes@release-tools --scope project');
    expect(result.stdout).toContain('claude plugin install release@release-tools --scope project');
    expect(result.stdout).toContain('codex plugin add release-notes@release-tools');
    expect(result.stdout).toContain('codex plugin add release@release-tools');
    expect(fs.readdirSync(root).sort()).toEqual(['.git', '.releasetools.yaml']);
  });

  it('uses requested plugins and prints each marketplace once', () => {
    const root = repository();
    const result = run(root, 'adopt',
      '--plugin', 'origin@mihaibojin', '--plugin', 'other@mihaibojin',
      '--plugin', 'release-notes@release-tools',
    );

    expect(result.status).toBe(0);
    expect(result.stdout.match(/marketplace add MihaiBojin\/agent-plugins/g)).toHaveLength(1);
    expect(result.stdout).toContain('claude plugin install origin@mihaibojin --scope project');
    expect(result.stdout).toContain('codex plugin add other@mihaibojin');
    expect(result.stdout).toContain('codex plugin add release-notes@release-tools');
  });

  it('replaces the default plugin list when one is specified', () => {
    const result = run(repository(), 'adopt', '--plugin', 'origin@mihaibojin');

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('release-notes@release-tools');
  });

  it.each([
    ['--dir'], ['--plugin'], ['--dir', '--plugin'], ['--unknown'],
    ['--plugin', 'release-notes'], ['--plugin', 'x@unknown'],
    ['--plugin', 'x@constructor'], ['--plugin', 'x;echo bad@release-tools'],
  ])('refuses invalid adoption arguments %j before writing', (...args) => {
    const root = repository();
    const result = run(root, 'adopt', ...args);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('config:');
    expect(fs.existsSync(path.join(root, '.releasetools.yaml'))).toBe(false);
  });

  it.each([['--help'], ['-h'], ['adopt', '--help'], ['adopt', '-h']])(
    'prints usage for %j without requiring a repository', (...args) => {
      const root = directory();
      const result = run(root, ...args);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('npx @releasetools/config adopt');
      expect(fs.readdirSync(root)).toEqual([]);
    },
  );

  it('declares the bump command the manifest ships, and a release block', () => {
    const root = repository({
      'pyproject.toml': '[project]\nname = "x"\nversion = "0.1.0"\n',
      'CHANGELOG.md': '# Changes\n',
      '.github/workflows/tests.yml': 'on: push\n',
      '.github/workflows/publish.yml': 'on: push\n',
    });
    const result = run(root, 'adopt');

    expect(result.status).toBe(0);
    expect(declared(root).projects).toEqual([
      {
        path: ['./'],
        manifest: ['pyproject.toml'],
        changelog: 'CHANGELOG.md',
        bump: 'uv version {version}',
      },
    ]);
    expect(declared(root).release).toEqual({ branch: 'main', merge: 'squash' });

    // The three that name something here are a person's to fill in, and the
    // workflows found are listed so they can be.
    const text = fs.readFileSync(path.join(root, '.releasetools.yaml'), 'utf8');
    expect(text).toContain('# The workflows here: publish.yml, tests.yml');
    expect(text).toContain('# checks:');
    expect(text).toContain('# publish:');
    expect(text).toContain('# registry:');
  });

  it('writes the release block where the repository has no workflows', () => {
    const root = repository({ 'package.json': '{"version":"1.0.0"}' });
    const result = run(root, 'adopt');

    expect(result.status).toBe(0);
    expect(declared(root).release).toEqual({ branch: 'main', merge: 'squash' });
    const text = fs.readFileSync(path.join(root, '.releasetools.yaml'), 'utf8');
    expect(text).toContain('# The workflows here: none here');
    expect(text).toContain('bump: npm version {version} --no-git-tag-version');
  });

  it('requires the adopt subcommand', () => {
    const root = directory();

    expect(run(root).status).toBe(1);
    expect(run(root, 'unknown').stderr).toContain("unknown command 'unknown'");
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('refuses a directory outside a git repository', () => {
    const root = directory();
    const result = run(root, 'adopt');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is not in a git repository');
    expect(fs.readdirSync(root)).toEqual([]);
  });
});
