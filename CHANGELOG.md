# Changelog

What changed in each release of the actions in this repository, newest
first.

## 0.2.0 - 2026-09-19

### Added

`changelog-section` hands one version's changelog section to whatever
publishes the release, as `notes`, with `found` saying whether there was a
section at all. It reads the heading the way `release-guard` reads it, out of
the same module, so the entry a pull request was made to write is the entry
the release publishes. It never fails on a missing section: a release workflow
wants to stop there and a draft might not, so the caller decides.

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
