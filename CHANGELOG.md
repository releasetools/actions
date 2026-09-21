# Changelog

What changed in each release of the actions in this repository, newest
first.

## 0.7.0 - 2026-09-21

### Added

`release.merge` is read out of `.releasetools.yaml` and checked like the keys
beside it: `squash`, `rebase` or `merge`, saying how a release's pull request
lands. The guards act on none of the release block, so nothing they report
changes.

## 0.6.0 - 2026-09-20

### Changed

`manifest` is required in every `projects` entry, and nothing is inferred from
what a directory happens to contain. Name every file that carries the
project's version: `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`
are one project keeping its version in two places, and both have to say the
same thing. Which files a version can be read out of is documented rather than
guessed at: any `.json`, `.toml`, `.yaml` or `.properties` file, or one holding
the version and nothing else.

A repository with no `.releasetools.yaml` is no longer judged as one project at
its root. Each guard posts a warning saying nothing is declared, and does not
run. A guessed project is reported on as though somebody had asked for it,
which is worse than saying there is nothing to check.

A pattern in `projects[].path` is refused by the reader as well as by the
guards, so every tool that reads the file gives the same answer rather than
each one deciding for itself.

`npx @releasetools/config adopt` names `VERSION` as a placeholder where no
file in the repository declares a version, and says why, since a project has
to say where its version lives.

## 0.5.0 - 2026-09-20

### Added

`npx @releasetools/config adopt` writes a starter `.releasetools.yaml`
from the repository's manifests and changelog. It preserves an existing
configuration and prints the plugin commands for the user to run.

Use `--dir` to target another checkout and repeat `--plugin` to choose
the plugins to declare. The command ships in `@releasetools/config`,
which publishes separately from the actions.

## 0.4.0 - 2026-09-20

### Changed

The action that reads one version’s changelog section is
`releasetools/actions/extract-release-notes`. Set workflow `uses` references
to `releasetools/actions/extract-release-notes@v0`.

## 0.3.0 - 2026-09-20

### Changed

Both guards require explicit directories in `projects[].path` and refuse
patterns with an error naming the path. Name each workspace package in the
configuration. `ignore-files` continues to accept patterns.

`versions-guard` passes projects holding no manifest. Existing manifests must
declare a valid version.

## 0.2.0 - 2026-09-19

### Removed

`release-guard` is gone, and what it did is now two actions. It asked one
question with two answers in it, so a repository that wanted the version check
and not the changelog check had no way to say so, and a failure on either read
as a failure of both.

### Added

`versions-guard` fails a pull request when a project changed without moving
its version far enough for what changed. How far follows from what the changes
say they are: a `fix` asks for a patch, a `feat` for a minor, a `!` or a
`BREAKING CHANGE:` footer for a major, and the largest in the range wins. A
`docs:` touching source asks for nothing, where the older rule asked for a
patch for any file that moved. The baseline is the newest tag reachable from
the commit rather than the newest by date, so a backport released yesterday on
a release branch is not mistaken for this line's last release.

`changelog-guard` fails a pull request that changes a project and writes
nothing down about it: the project's changelog has to carry a `##` heading
naming the version its manifest declares, which is a new heading whenever the
version moved. A group that names no changelog owes none.

`changelog-section` hands one version's changelog section to whatever
publishes the release, as `notes`, with `found` saying whether there was a
section at all. It reads the heading the way `changelog-guard` reads it, out
of the same module, so the entry a pull request was made to write is the entry
the release publishes. It never fails on a missing section: a release workflow
wants to stop there and a draft might not, so the caller decides.

A pull request labelled `skip-versions-guard` or `skip-changelog-guard` passes
that guard with a notice saying so, so one can be skipped without the other.

### Changed

Both guards read `.releasetools.yaml` at the repository root, the file every
releasetools tool reads, rather than taking their configuration from the
workflow. Projects, the files whose edits do not count, and whether those
patterns match case are declared once by the repository, so including the
action is the whole of switching a guard on. `base` is the only input left.
A convention named under `conventions.except` is one no guard checks.
`versions-guard` reads `bump-from-type`, and excepting it drops the type table
and asks only that a material change move the version at all;
`changelog-guard` reads `changelog-per-change`, and excepting it turns the
guard off wherever the file is read rather than in one workflow.

Versions are compared the way
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) says to, so
`0.2.0-rc.1` sorts after `0.1.0` and before `0.2.0` where it used to read as
equal to `0.2.0` and a bump to a candidate looked like no bump at all. Build
metadata after a `+` is ignored, as the specification says. A version that is
not a semantic one, `1.0` or `v1.2`, is a failure naming it rather than a
guess: a range, a lockfile and a resolver all read a version, and none of them
can read those.

A manifest that resolves outside the checkout is refused rather than read, and
the message never says where it pointed.

## 0.1.1 - 2026-09-19

Neither action changed.

The repository keeps a changelog from here, and a release publishes that
version's section as its notes, so what a release contains is written down
rather than left to a compare link. An exact version tag is written once:
releasing a version that already has a tag fails, rather than rewriting
what somebody pinned to it. The floating major still moves.

## 0.1.0 - 2026-09-19

### Added

`release-guard` fails a pull request when a project changed without
recording a release. Every project whose source moved since the branch
forked has to carry a higher version, and, where a group names a changelog,
a section claiming that version.

A project is any directory with its own version. `projects` declares them
in groups, each saying which manifests and changelog govern which paths,
and the repository itself is the default, so a repository that is one
versioned thing configures nothing. The version is read from
`package.json`, `pyproject.toml`, `Cargo.toml`, `Chart.yaml`,
`gradle.properties` or a plain `VERSION` file, and every one a project
holds has to agree.

The comparison is the fork point, which is the diff GitHub shows under
Files changed, so a base branch that moved on does not read as this
branch's change. Files git has never been told about count alongside the
diff. Failures arrive as annotations titled `Version not bumped`,
`Changelog not updated` or `Release guard could not run`, and a pull
request labelled `skip-release-guard` passes with a notice saying so.

### Changed

`signed-push` behaves exactly as it did and ships a bundle less than half
the size, 1485kB down to 710kB. The terser inside ncc 0.38 could not parse
a computed class field in undici, which the bundle reaches through
`@actions/core`, so ncc caught the parse error and emitted the unminified
bundle. `--minify` had been doing nothing since undici 7 landed.
