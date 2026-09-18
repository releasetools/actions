# `plugin-release`

Fail a pull request when a plugin changed without declaring its release. It
runs as a GitHub Action on `pull_request`, and as a command a maintainer can
run before pushing.

A marketplace monorepo publishes from `main`, so an edit to a plugin is just a
commit and the merge is the release. That leaves the diff as the only place to
catch a plugin that shipped under its old version, which no client will fetch,
or one that shipped with nothing written down about what changed.

## Quick start

```yaml
- uses: actions/checkout@v6
  with:
    # The check compares this tree against the base branch, so it needs both.
    fetch-depth: 0

- uses: releasetools/actions/plugin-release@v0
  if: github.event_name == 'pull_request'
  with:
    base: ${{ github.event.pull_request.base.sha }}
```

Every plugin that failed the rule becomes an annotation on the pull request,
and the step fails.

## Run it before you push

```bash
npm install --save-dev @releasetools/plugin-release
```

```json
"scripts": {
  "check:release": "plugin-release --base origin/main"
}
```

The published package version matches the action release it was built from, so
`@releasetools/plugin-release@0.1.0` is the CLI inside
`releasetools/actions/plugin-release@v0.1.0`.

The command takes the action's inputs as flags, plus `--root` for the
repository root, and returns the same exit codes:

```bash
plugin-release --base origin/main --plugins-dir extensions
```

## The rule

For every immediate subdirectory of `plugins/`, in name order:

1. Ask git whether anything under it changed against `base`. Nothing changed,
   nothing to check.
2. Read the version from the working tree's manifest.
3. Read the manifest at `base`. Absent means the plugin is new, so no version
   comparison is asked of it.
4. Present means the working tree's version must be strictly greater. Equal or
   lower fails, and that plugin is not checked further.
5. `CHANGELOG.md` must exist and must open a section for the version the
   working tree now claims.

A missing changelog and a changelog with no section for the new version are
two different failures, reported differently.

### What counts as a section

A line matching `^##\s+v?<version>(\s|$)`, anywhere in the file.

| heading | against version `0.2.0` |
| --- | --- |
| `## 0.2.0` | passes |
| `## 0.2.0 - 2026-09-11` | passes, which is what the release-notes plugin writes |
| `## v0.2.0` | passes |
| `## 0.2.0-rc1` | fails |
| `### 0.2.0` | fails |

### Comparing versions

Numeric, segment by segment. A segment that is not a number counts as zero, so
`0.2.0-rc1` does not read as an increase on `0.2.0`. A version that went
backwards fails the same way as one that stood still, because the fix is the
same.

## Input reference

| input | default | |
| --- | --- | --- |
| `base` | required | the ref to compare against. On a pull request, `github.event.pull_request.base.sha` |
| `plugins-dir` | `plugins` | where the plugins are, relative to the repository root |
| `manifest` | `.claude-plugin/plugin.json` | the file holding `version`, relative to a plugin's directory |
| `changelog` | `CHANGELOG.md` | relative to a plugin's directory |

The action reports through `@actions/core`: one `info` line per plugin that
declared a release, one `error` annotation per plugin that did not.

## Output and exit codes

The command writes one line per plugin that declared a release, then a verdict:

```
docket 0.2.0 -> 0.2.1
readme is new, at 0.1.0
Every changed plugin declared its release
```

Failures go to stderr under a `Release check failed:` heading, one `- ` line
each.

| code | |
| --- | --- |
| 0 | the rule holds |
| 1 | at least one plugin failed it |
| 2 | usage: no `base`, an unknown flag, or a plugins directory that is not there |

## What it will not do

It never reads, writes or infers a version, and it never edits a changelog.
Drafting the entry belongs to whoever writes the release; this only checks that
somebody did. There is no way to ask for the version half alone, because a
release that records nothing is the failure it exists to catch.

## License

Apache 2.0. See [LICENSE](../LICENSE).
