# `@releasetools/config`

Read `.releasetools.yaml`, the configuration shared by releasetools, or
write a starter file with `npx @releasetools/config adopt`.

One implementation, because two would be two answers to which project a change
belongs to, and the one that disagrees sends a guard to the wrong directory or
a release note to the wrong changelog. The format it reads is written down in
the [conventions](https://github.com/releasetools/conventions/blob/main/FORMAT.md),
so this answers to a specification rather than to its callers.

```js
const { settingsFrom } = require('@releasetools/config');

const declared = settingsFrom(fs.readFileSync('.releasetools.yaml', 'utf8'));
// { projects: [...], ignoreFiles: null, caseSensitive: false, except: [] }
```

Plain CommonJS with no dependencies, and no build. A Claude Code plugin is
installed as a clone of its marketplace and never runs `npm install`, so the
plugin that reads this file carries `releasetools-config.js` verbatim and
loads it with `createRequire`, rather than depending on the package.

It reads the subset of YAML the format is written in: mappings, lists, scalars
and flow lists of scalars. An anchor, a tag or a block scalar is refused by
name and line rather than guessed at.

## Adopt the conventions

Run this from a Git working tree:

```sh
npx @releasetools/config adopt
```

The command writes `.releasetools.yaml` at the Git root, declaring that
directory as one project. It names the manifests that declare a version,
`CHANGELOG.md` when present, and the `bump` command the manifest's ecosystem
ships. An existing `.releasetools.yaml` is preserved. Review the file before
committing it; a workspace needs each project named explicitly.

It also writes a `release:` block, which is what cuts a release reads. Only
`branch` and `merge` are filled in, at their defaults. The three that name
something in your repository are left commented, with the workflow filenames
found here listed beside them: guessing which one publishes is worse than a
line somebody fills in.

```yaml
release:
  branch: main
  merge: squash
  # The workflows here: publish.yml, tests.yml
  # checks: the one that must be green on the commit a tag will name
  # publish: the one a tag starts
  # registry: a URL answering 404 for a version nobody has released,
  #           with {version} where the version goes
```

The command checks these filenames using the same version reader as the
guards:

| Format | Filenames |
| --- | --- |
| JSON | `package.json`, `composer.json`, `deno.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` |
| TOML | `pyproject.toml`, `Cargo.toml` |
| YAML | `pubspec.yaml`, `Chart.yaml` |
| Properties | `gradle.properties` |
| Plain text | `VERSION`, `version.txt` |

Files with no readable version are reported and omitted. Different versions
across manifests are reported for you to reconcile. When no manifest
declares a version, the starter project omits `manifest`.

To target another checkout, including a path containing spaces:

```sh
npx @releasetools/config adopt --dir '../my project'
```

The command prints the Claude and Codex plugin commands for you to run.
The default plugins are `release-notes@release-tools` and
`release@release-tools`, which are the two that read the file it wrote. To
supply your own list, repeat `--plugin`:

```sh
npx @releasetools/config adopt \
  --plugin release-notes@release-tools \
  --plugin origin@mihaibojin
```

| Marketplace | Repository |
| --- | --- |
| `release-tools` | `releasetools/agent-plugins` |
| `mihaibojin` | `MihaiBojin/agent-plugins` |

`npx @releasetools/config --help` prints the command syntax. Adoption needs
Git and Node.js 20 or later. The package has no dependencies and needs no
build step.

## License

Apache 2.0. See [LICENSE](../../LICENSE).
