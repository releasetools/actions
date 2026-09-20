# Changelog

## 0.3.0 - 2026-09-20

### Changed

`manifest` is required in every `projects` entry, and nothing is inferred from
what a directory holds. A project names every file that carries its version,
and all of them have to declare the same one.

A pattern in `projects[].path` is refused here rather than only by whatever
reads the declaration, so every tool gives the same answer.

`adopt` names `VERSION` as a placeholder where nothing in the repository
declares a version, with a comment saying to name the file that will.

`ABSENT` is the sentence a tool prints when a repository has no
`.releasetools.yaml`: there is nothing to check, and a guess would be reported
on as though somebody had asked for it.

## 0.2.0 - 2026-09-20

### Added

`npx @releasetools/config adopt` writes a starter `.releasetools.yaml`
from the repository's manifests and changelog. It preserves an existing
configuration and prints the plugin commands for the user to run.

Use `--dir` to target another checkout and repeat `--plugin` to choose
the plugins to declare.
