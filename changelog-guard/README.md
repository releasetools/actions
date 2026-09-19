# `changelog-guard`

Fail a pull request that changes a project and writes nothing down about it.

What that means in a diff: the project's changelog has to carry a `##` heading
naming the version its manifest declares. A change a reader can observe moves
that version, so the heading is a new one, and writing what goes under it is
the pull request's job rather than the release's.

A fix shipped with nothing written down loses the reasoning while somebody
still remembers it, and the reader who needs it is on the previous version
deciding whether this one affects them.

## Quick start

```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0

- uses: releasetools/actions/changelog-guard@v0
  if: github.event_name == 'pull_request'
```

## Configuration

`.releasetools.yaml` at the repository root, the same file every releasetools
tool reads. A group that names no changelog owes none, so this asks nothing
until one does:

```yaml
projects:
  - path: packages/*
    manifest: package.json
    changelog: CHANGELOG.md
```

`ignore-files` and `case-sensitive` decide what counts as a project changing,
and [`versions-guard`](../versions-guard/) documents them. The action's one
input is `base`, the ref to compare against, for the runs that are not pull
requests.

This checks one convention, `changelog-per-change`: an entry belongs to the
change that makes it, not to whoever reconstructs the release afterwards.
Naming it under `conventions.except` turns the guard off wherever the file is
read, rather than in one workflow.

## What counts as a heading

A `##` carrying the version the project's manifest now declares.

| heading | against version `0.2.0` |
| --- | --- |
| `## 0.2.0` | passes |
| `## 0.2.0 - 2026-09-19` | passes, which is what the release-notes plugin writes |
| `## [0.2.0] - 2026-09-19` | passes, which is what Keep a Changelog writes |
| `## v0.2.0` | passes |
| `## 0.2.0-rc1` | fails |
| `### 0.2.0` | fails |

## What it cannot catch on its own

A project whose version never moved is satisfied by the section written for
the last release, because that section carries the version the manifest still
claims. That is not a gap to close here: it is what
[`versions-guard`](../versions-guard/) is for, and why both ship.

## Turning it off for one pull request

Label it `skip-changelog-guard`.

## License

Apache 2.0. See [LICENSE](../LICENSE).
