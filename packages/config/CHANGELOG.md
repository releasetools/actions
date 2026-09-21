# Changelog

Newest first. Each version here is one npm published: `0.2.0` was written and
never dispatched, so what it described shipped in `0.3.0`.

## 0.5.0 - 2026-09-22

### Added

`adopt` writes a `release:` block, which is what cuts a release reads. Only
`branch` and `merge` are filled in, at their defaults. The three that name
something in the repository are left commented, with the workflow filenames
found there listed beside them, because guessing which one publishes is worse
than a line somebody fills in.

`adopt` writes each project's `bump` command where the manifest's ecosystem
ships one: `npm version`, `uv version`, `cargo set-version`, `dart pub
version`, `deno bump`. A project whose manifest is none of those sets its
version by hand, as before.

`release@release-tools` joins the default plugin list. It and the release
notes plugin are the two that read the file this writes.

## 0.4.0 - 2026-09-21

### Added

`release.merge` is read and checked like the keys beside it: `squash`,
`rebase` or `merge`, saying how a release's pull request lands. It was an
unknown key, so it reached nothing that reads this file.

## 0.3.0 - 2026-09-20

### Added

`npx @releasetools/config adopt` writes a starter `.releasetools.yaml` from
the repository's manifests and changelog. It preserves an existing
configuration and prints the plugin commands for the user to run. Use `--dir`
to target another checkout and repeat `--plugin` to choose the plugins to
declare. Where nothing in the repository declares a version it names `VERSION`
as a placeholder, with a comment saying to name the file that will.

`ABSENT` is the sentence a tool prints when a repository has no
`.releasetools.yaml`: there is nothing to check, and a guess would be reported
on as though somebody had asked for it.

### Changed

`manifest` is required in every `projects` entry, and nothing is inferred from
what a directory holds. A project names every file that carries its version,
and all of them have to declare the same one.

A pattern in `projects[].path` is refused here rather than only by whatever
reads the declaration, so every tool gives the same answer.

## 0.1.0 - 2026-09-19

### Added

Reading `.releasetools.yaml`: the projects a repository declares, the files
whose edits do not count as one changing, and the conventions it does not
follow. The subset of YAML the format is written in, with anything outside it
refused by name and line.
