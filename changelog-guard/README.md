# `changelog-guard`

Fail a pull request when a module changed without recording it. It runs as a
GitHub Action on `pull_request`, and as a command a maintainer can run before
pushing.

A module here is any directory with its own version: the repository itself, a
package in a workspace, a plugin in a marketplace. Where a repository installs
straight off `main` there is no build and no publish step to hang a check on.
An edit is just a commit, and the merge is the release. That leaves the diff as
the only place to catch a module that shipped under its old version, which no
client will fetch, or one that shipped with nothing written down about what
changed.

## Quick start

For a repository that is one versioned thing, `base` is the only input:

```yaml
- uses: actions/checkout@v6
  with:
    # The check compares this tree against the base branch, so it needs both.
    fetch-depth: 0

- uses: releasetools/actions/changelog-guard@v0
  if: github.event_name == 'pull_request'
  with:
    base: ${{ github.event.pull_request.base.sha }}
```

For a repository of many, name them:

```yaml
- uses: releasetools/actions/changelog-guard@v0
  if: github.event_name == 'pull_request'
  with:
    base: ${{ github.event.pull_request.base.sha }}
    modules: packages/*
    manifest: package.json
```

Every module that failed the rule becomes an annotation on the pull request,
and the step fails.

## Run it before you push

```bash
npm install --save-dev @releasetools/changelog-guard
```

```json
"scripts": {
  "check:changelog": "changelog-guard --base origin/main --modules 'packages/*'"
}
```

The published package version matches the action release it was built from, so
`@releasetools/changelog-guard@0.1.0` is the CLI inside
`releasetools/actions/changelog-guard@v0.1.0`.

The command takes the action's inputs as flags, one for one, plus `--root` for
the repository root, and returns the same exit codes. It also sees files git
has never been told about, so a module you have written but not committed is
checked the way it will be once you do.

## Which modules get checked

`modules` is a newline-delimited list of directories, as paths or globs.

| pattern | |
| --- | --- |
| `./` | the repository itself, one module. The default |
| `./*` | every directory at the top, hidden ones excluded |
| `packages/*` | every directory under `packages` |
| `packages/web` | that one |

Patterns expand a segment at a time rather than by walking the repository, so
naming a directory costs a read of its parent. A pattern that matches no
directory fails the run: checking nothing is the one outcome that looks like
success and is not.

## The rule

For every module, in path order:

1. Ask git what changed under it against `base`, and what it holds that git has
   never seen. Drop the files `ignore-files` names. Nothing left, nothing to
   check.
2. Read the version from the working tree's manifest.
3. Read the manifest at `base`. Absent means the module is new, so no version
   comparison is asked of it.
4. Present means the working tree's version must be strictly greater. Equal or
   lower fails, and that module is not checked further.
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

### What does not count as a change

`ignore-files` names the files a release writes anyway, so editing one of them
alone asks for nothing. Without it, fixing a typo in a changelog would demand a
version whose only change is the sentence describing the typo.

Each pattern is matched against the end of a path, on segment boundaries, so
one entry covers a file that appears once per module:

| pattern | matches |
| --- | --- |
| `README.md` | `README.md` and `docs/README.md`, at any depth |
| `docs/README.md` | only a `README.md` inside a `docs` |
| `*.md` | any Markdown file, at any depth |
| `docs/**` | everything under any `docs` |

`*` and `?` match inside one segment, `**` across them. Matching ignores case
unless `case-sensitive` is set, because `README.md` and `ReadMe.md` are the
same file to whoever wrote the pattern. Set the input empty to count every
file.

A changed module still has to carry a changelog section for its new version:
`ignore-files` decides what counts as changing, not what a release has to say.

## Input reference

| input | default | |
| --- | --- | --- |
| `base` | required | the ref to compare against. On a pull request, `github.event.pull_request.base.sha` |
| `modules` | `./` | newline-delimited directories to check, as paths or globs |
| `manifest` | `package.json` | the file holding `version`, relative to a module |
| `changelog` | `CHANGELOG.md` | relative to a module |
| `ignore-files` | `CHANGELOG.md`, `README.md`, `LICENSE` | newline-delimited files whose edits are not a change |
| `case-sensitive` | `false` | match `ignore-files` exactly rather than ignoring case |

The action reports through `@actions/core`: one `info` line per module that
recorded its new version, one `error` annotation per module that did not.

### Turning it off for one pull request

Label the pull request `skip-changelog-guard`. The action posts a notice saying
it skipped and passes, so a check somebody turned off is visible on the pull
request that turned it off.

The label is one fixed name rather than an input. A configurable escape hatch
is a different escape hatch in every repository, and a reviewer looking at a
pull request that skipped the check would have to read that repository's
workflow to learn what the label was called.

The CLI has no equivalent: there is no pull request to carry a label.

## Output and exit codes

The command writes one line per module that recorded its new version, then a
verdict:

```
packages/api 0.2.0 -> 0.2.1
packages/web is new, at 0.1.0
Every changed module recorded its new version
```

A module is named by its path, or by the repository's own directory name when
it is the repository. Failures go to stderr under a `Changelog check failed:`
heading, one `- ` line each.

| code | |
| --- | --- |
| 0 | the rule holds |
| 1 | at least one module failed it |
| 2 | usage: no `base`, an unknown flag, or a pattern matching no directory |

## What it will not do

It never reads, writes or infers a version, and it never edits a changelog.
Drafting the entry belongs to whoever writes the release; this only checks that
somebody did, and never judges what the entry says. There is no way to ask for
the version half alone, because a change that records nothing is the failure it
exists to catch.

## License

Apache 2.0. See [LICENSE](../LICENSE).
