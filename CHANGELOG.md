# Changelog

What changed in each release of the actions in this repository, newest
first. Releases before 0.1.0 are in the tag history: the changelog starts
here.

## 0.1.0 - 2026-09-19

### Added

`release-guard` fails a pull request when a project changed without
recording a release. Every project whose source moved since the branch
forked has to carry a higher version, and, where `check-changelog` names
one, a changelog section claiming that version.

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
