# Changelog

Newest first. Each version here is one npm published: `0.2.0` was written and
never dispatched, so what it described shipped in `0.3.0`.

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
