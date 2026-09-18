# `changelog-guard`

Fail a pull request when a project changed without recording it.

A project here is any directory with its own version: the repository itself, or
each package in a workspace. Where a repository installs straight off `main`
there is no build and no publish step to hang a check on. An edit is just a
commit, and the merge is the release. That leaves the diff as the only place to
catch a project that shipped under its old version, which no client will fetch,
or one that shipped with nothing written down about what changed.

## Quick start

For a repository that is one versioned thing, it needs no inputs at all. A pull
request already says what it is against, and the action reads that from the
event:

```yaml
- uses: actions/checkout@v6
  with:
    # The check compares this tree against the base branch, so it needs both.
    fetch-depth: 0

- uses: releasetools/actions/changelog-guard@v0
  if: github.event_name == 'pull_request'
```

For a repository of many, name them:

```yaml
- uses: releasetools/actions/changelog-guard@v0
  if: github.event_name == 'pull_request'
  with:
    projects: packages/*
```

Outside a pull request there is nothing to read, so `base` has to be set.

Every project that failed the rule becomes an annotation on the pull request,
and the step fails.

## Which projects get checked

`projects` is a newline-delimited list of directories, as paths or globs.

| pattern | |
| --- | --- |
| `./` | the repository itself, one project. The default |
| `./*` | every directory at the top, hidden ones excluded |
| `packages/*` | every directory under `packages` |
| `packages/web` | that one |

Patterns expand a segment at a time rather than by walking the repository, so
naming a directory costs a read of its parent. A pattern that matches no
directory fails the run: checking nothing is the one outcome that looks like
success and is not.

## The rule

For every project, in path order:

1. Ask git what changed under it against `base`, and what it holds that git has
   never seen. Drop the files `ignore-files` names. Nothing left, nothing to
   check.
2. Read the version from the first of `manifests` the project holds.
3. Read that same file at `base`. Absent means the project is new, so no
   version comparison is asked of it.
4. Present means the working tree's version must be strictly greater. Equal or
   lower fails, and that project is not checked further.
5. `CHANGELOG.md` must exist and must open a section for the version the
   working tree now claims.

A missing changelog and a changelog with no section for the new version are
two different failures, reported differently.

### What counts as a section

A line matching `^##\s+\[?v?<version>\]?(\s|$)`, anywhere in the file.

| heading | against version `0.2.0` |
| --- | --- |
| `## 0.2.0` | passes |
| `## 0.2.0 - 2026-09-11` | passes, which is what the release-notes plugin writes |
| `## [0.2.0] - 2026-09-11` | passes, which is what Keep a Changelog writes |
| `## v0.2.0` | passes |
| `## 0.2.0-rc1` | fails |
| `### 0.2.0` | fails |

### Where the version comes from

`manifests` lists the files that may declare it, relative to a project, tried
in order until one is there. The kind is read from the name, so a project names
its file and nothing else:

| file | where the version is |
| --- | --- |
| any `.json` | the top-level `version` |
| any `.toml` | the `version` of its `package`, `project`, `tool.poetry` or `workspace.package` table, never a dependency's |
| `.yaml`, `.yml` | a top-level `version:`, never an indented one |
| `.properties` | a `version=` line, which is where Gradle keeps it |
| anything else | the file is the version and nothing else, as `VERSION` holds it |

XML is refused rather than read: a `<version>` in a `pom.xml` can be the
project's or its parent's, and a wrong version is worse than a plain refusal.

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
one entry covers a file that appears once per project:

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

A changed project still has to carry a changelog section for its new version:
`ignore-files` decides what counts as changing, not what a release has to say.

## Input reference

| input | default | |
| --- | --- | --- |
| `base` | the pull request's base | the ref to compare against. Read from the event on a pull request, required anywhere else |
| `projects` | `./` | newline-delimited directories to check, as paths or globs |
| `manifests` | `package.json`, `pyproject.toml`, `Cargo.toml`, `VERSION` | newline-delimited files that may declare the version, first one found wins |
| `changelog` | `CHANGELOG.md` | relative to a project |
| `ignore-files` | `CHANGELOG.md`, `README.md`, `LICENSE` | newline-delimited files whose edits are not a change |
| `case-sensitive` | `false` | match `ignore-files` exactly rather than ignoring case |

The action reports through `@actions/core`: one `info` line per project that
recorded its new version, and one `error` annotation per project that did not,
titled by the half of the rule that failed. `Version not bumped` and `Changelog
not updated` are separate titles so a reviewer can see which one fired without
reading the message, and `Changelog guard could not run` is neither: a base ref
git cannot reach, a `projects` pattern matching nothing, or a manifest that
declares no version.

### Turning it off for one pull request

Label the pull request `skip-changelog-guard`. The action posts a notice saying
it skipped and passes, so a check somebody turned off is visible on the pull
request that turned it off.

The label is one fixed name rather than an input. A configurable escape hatch
is a different escape hatch in every repository, and a reviewer looking at a
pull request that skipped the check would have to read that repository's
workflow to learn what the label was called.

## What it reports

The action logs one line per project that recorded its new version, then a
verdict:

```
packages/api 0.2.0 -> 0.2.1
packages/web is new, at 0.1.0
Every changed project recorded its new version
```

A project is named by its path, or by the repository's own directory name when
it is the repository. Every failure becomes an `error` annotation, and the step
fails once with `Changelog check failed. See the annotations.`

A run that could not start at all fails the same way with what was wrong:
nothing to compare against, or a `projects` pattern matching no directory.

## What it will not do

It never reads, writes or infers a version, and it never edits a changelog.
Drafting the entry belongs to whoever writes the release; this only checks that
somebody did, and never judges what the entry says. There is no way to ask for
the version half alone, because a change that records nothing is the failure it
exists to catch.

## License

Apache 2.0. See [LICENSE](../LICENSE).
