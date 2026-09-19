# `changelog-guard`

Fail a pull request when a project changed without a changelog section for the
version it now claims.

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

`.releasetools.yml` at the repository root, the same file every releasetools
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

## What counts as a section

A `##` heading carrying the version the project's manifest now declares.

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
