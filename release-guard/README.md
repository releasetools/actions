# `release-guard`

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

- uses: releasetools/actions/release-guard@v0
  if: github.event_name == 'pull_request'
```

That asks the repository for a version that moved, and nothing else. It looks
for one in `package.json`, `pyproject.toml`, `Cargo.toml` or a `VERSION` file,
whichever the repository holds, and fails the step when the version stood
still:

```
Version not bumped
  my-repo changed but its version is still 0.1.0. Somebody has 0.1.0
  installed, and a client compares versions to decide whether an update
  exists, so bump it before merging.
```

Outside a pull request there is nothing to read, so `base` has to be set.

## Examples

**A changelog beside the version.** Name the file, and a project that bumped
also has to say what changed:

```yaml
- uses: releasetools/actions/release-guard@v0
  if: github.event_name == 'pull_request'
  with:
    projects: |
      - path: ./
        changelog: CHANGELOG.md
```

**Projects of different kinds.** A group says which files govern which
directories, so a crate sits beside a package beside a chart:

```yaml
    projects: |
      - path: packages/*
        manifest: package.json
        changelog: CHANGELOG.md
      - path: crates/*
        manifest: Cargo.toml
      - path: charts/*
        manifest: Chart.yaml
        changelog: CHANGELOG.md
```

**A version kept in two places.** Every file a project holds has to agree, and
one it does not hold is not its business:

```yaml
    projects: |
      - path: services/*
        manifest:
          - package.json
          - VERSION
```

```
Version not bumped
  services/api declares 2.1.0 in services/api/package.json and 2.0.0 in
  services/api/VERSION. Whichever a client reads is the one that decides
  whether it updates, so they have to say the same thing.
```

**One project named, its neighbours globbed.** A directory two groups reach
belongs to the first, so the specific entry goes above the general one:

```yaml
    projects: |
      - path: packages/legacy
        manifest: VERSION
      - path: packages/*
        manifest: package.json
        changelog: CHANGELOG.md
```

**More files that are not a change.** Setting `ignore-files` replaces the
default rather than adding to it, so carry the entries you still want:

```yaml
    ignore-files: |
      CHANGELOG.md
      README.md
      LICENSE
      docs/**
      *.test.ts
```

Each group's own changelog and manifests never count whatever this says, so
`CHANGELOG.md` belongs here for a group that keeps one without asking for it
to be checked.

Every project that failed the rule becomes an annotation on the pull request,
and the step fails.

## Declaring the projects

`projects` is a YAML list of groups. A repository is rarely one kind of thing,
and a group says which files govern which directories, so nothing has to be
guessed.

| key | |
| --- | --- |
| `path` | one name or a list, as paths or globs. Required |
| `manifest` | one name or a list. Every file a project holds has to declare the same version; one it does not hold is not its business. Left out: `package.json`, `pyproject.toml`, `Cargo.toml`, `VERSION` |
| `changelog` | the file to check. Left out, that group owes none |

Left empty, the whole input, the repository itself is the one project.

### What a path matches

| pattern | |
| --- | --- |
| `./` | the repository itself, one project |
| `./*` | every directory at the top, hidden ones excluded |
| `packages/*` | every directory under `packages` |
| `packages/web` | that one |

Patterns expand a segment at a time rather than by walking the repository, so
naming a directory costs a read of its parent. A pattern that matches no
directory fails the run: checking nothing is the one outcome that looks like
success and is not.

A directory only counts as a project if it holds one of its group's manifests.
Naming one that does not is an error, because the name was a claim; a glob that
turns one up walks past it, because a glob is a search, and `./*` over a
repository with a `docs/` has not found anything wrong. So `packages/*` reads
as "every package under packages", and `packages/web` as "this, and it had
better be one".

A directory two groups both reach belongs to the first, so a group naming one
project can sit above the group that globs its neighbours.

## The rule

For every project, in path order:

1. Ask git what changed under it since the branch forked, and what it holds
   that git has never seen. Nothing at all, nothing to check.
2. Read the version from every manifest the project holds, which all have to
   agree, and from the first of them that was there at the fork point. None of
   them there means the project is new, so no comparison is asked of it.
3. Set aside the files a release writes: its group's changelog and manifests,
   and whatever `ignore-files` names. If nothing else moved and the version did
   not either, there is no release here and nothing to check.
4. The version must be strictly greater than at the fork point. Equal or lower
   fails, and that project is not checked further.
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

A group's `manifest` list is the set of files that may declare it. Every one a
project holds has to say the same thing, because whichever a client reads is
the one that decides whether it updates, and two answers is not a version. One
the project does not hold is ignored, so a list can cover a group whose members
differ.

The kind is read from the name, so a project names its file and nothing else:

### Comparing versions

Numeric, segment by segment. A segment that is not a number counts as zero, so
`0.2.0-rc1` does not read as an increase on `0.2.0`. A version that went
backwards fails the same way as one that stood still, because the fix is the
same.

### What does not count as a change

A release writes two things into the project it releases: the changelog entry
and the new version. Neither counts as the change being recorded, whatever
`ignore-files` says, because counting them would ask for a release whose only
content is the sentence announcing it.

A version that moves is a release even when nothing else did, so a commit that
bumps and writes nothing up is still caught. A manifest edit that moves no
version, a dependency range or a script, asks for nothing.

`ignore-files` adds to that list, applies to every group, and defaults to
`CHANGELOG.md`, `README.md` and `LICENSE`. Setting it replaces those three
rather than adding to them. Each pattern is matched against the end of a path,
on segment boundaries, so one entry covers a file that appears once per
project:

| pattern | matches |
| --- | --- |
| `README.md` | `README.md` and `docs/README.md`, at any depth |
| `docs/README.md` | only a `README.md` inside a `docs` |
| `*.md` | any Markdown file, at any depth |
| `docs/**` | everything under any `docs` |

`*` and `?` match inside one segment, `**` across them. Matching ignores case
unless `case-sensitive` is set, because `README.md` and `ReadMe.md` are the
same file to whoever wrote the pattern. Set the input empty to count every
other file.

A changed project still has to carry a changelog section for its new version:
this decides what counts as changing, not what a release has to say.

### Asking for a changelog

A group's `changelog` names the file, usually `CHANGELOG.md`. Left out, that
group owes none, which is the default everywhere. Most repositories keep no
changelog per project, and a check that fails every one of them on the day it
is installed is a check nobody installs twice.

The reverse is not offered. A changelog check without the version is satisfied
by an entry written a year ago, since nothing makes the section it looks for a
new one.

## Input reference

| input | default | |
| --- | --- | --- |
| `base` | the pull request's base | the ref to compare against, resolved to where the branch forked from it. Read from the event on a pull request, required anywhere else |
| `projects` | the repository itself | a YAML list of groups, each with a `path`, and optionally a `manifest` and a `changelog` |
| `ignore-files` | `CHANGELOG.md`, `README.md`, `LICENSE` | more files whose edits are not a change, on top of each group's changelog and manifests. Setting it replaces the default |
| `case-sensitive` | `false` | match those patterns exactly rather than ignoring case, the group's changelog and manifests included |

The action reports through `@actions/core`: one `info` line per project that
recorded its new version, and one `error` annotation per project that did not,
titled by the half of the rule that failed. `Version not bumped` and `Changelog
not updated` are separate titles so a reviewer can see which one fired without
reading the message, and `Release guard could not run` is neither: a base ref
git cannot reach, a `projects` pattern matching nothing, or a manifest that
declares no version.

### Turning it off for one pull request

Label the pull request `skip-release-guard`. The action posts a notice saying
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
fails once with `Release check failed. See the annotations.`

A run that could not start at all fails the same way with what was wrong:
nothing to compare against, or a `projects` pattern matching no directory.

## What it will not read

The working tree on a pull request is written by whoever opened it, so a file
this action reads can be a link to somewhere else on the runner. It reads
versions out of files and prints them, which is enough to publish whatever it
found, so every path is resolved through its links and checked against the
repository root before anything is opened. One that lands outside is refused,
and the message says so without naming where it went.

`path`, `manifest` and `changelog` are refused at the same door: an absolute
path, or one with a `..` that leaves the repository, fails the run rather than
being resolved. A link that stays inside is followed as normal, so a project
whose version lives in a shared file still works.

A glob never follows a symlinked directory, so `packages/*` matches real
directories only. YAML tags that ask for code, `!!js/function` and its family,
are not in the schema this parses with and are refused as unknown.

## What it will not do

It never reads, writes or infers a version, and it never edits a changelog.
Drafting the entry belongs to whoever writes the release; this only checks that
somebody did, and never judges what the entry says. There is no way to ask for
the version half alone, because a change that records nothing is the failure it
exists to catch.

## License

Apache 2.0. See [LICENSE](../LICENSE).
