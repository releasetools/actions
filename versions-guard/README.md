# `versions-guard`

Fail a pull request when a project changed without moving its version far
enough for what changed.

How far is not a judgement about the size of a diff. It follows from what the
changes say they are, by
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), which is the
[releasetools conventions](https://github.com/releasetools/conventions)'
`bump-from-type`.

## Quick start

```yaml
- uses: actions/checkout@v6
  with:
    # The comparison needs the fork point, so the whole history.
    fetch-depth: 0

- uses: releasetools/actions/versions-guard@v0
  if: github.event_name == 'pull_request'
```

A pull request already says what it is against, and the repository already
says what it holds, so including the action is the whole of switching the
check on.

## What it asks

| the changes say | the version has to reach |
| --- | --- |
| `fix`, `perf`, `security` | the next patch |
| `feat`, `deprecate` | the next minor |
| anything with `!` or a `BREAKING CHANGE:` footer | the next major, or the next minor under `0.y.z` |
| only `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style` | nothing |

The largest in the range wins, so one `feat` among forty fixes asks for a
minor. Reaching further than asked is not a failure: a minor already claimed
by an earlier unreleased change absorbs every patch that follows it.

```
Version not bumped
  packages/api is at 1.2.4, and a feat (read Cargo.toml) asks for at least
  1.3.0 after 1.2.3. Somebody has 1.2.3 installed, and a client compares
  versions to decide whether an update exists.
```

## What it compares against

The newest tag reachable from the commit, which is what `git describe`
answers, not the newest tag by date. A `1.2.3` backported yesterday onto a
release branch is not an ancestor of this commit, so it is another line's
release and never the baseline here. On that branch it is.

Where no such tag is reachable, the baseline is what the manifest said at the
fork point. A repository that tags nothing, or that tags a published tree
outside its own history, is judged that way throughout.

## Configuration

Everything but the base ref comes from `.releasetools.yaml` at the repository
root, read by every releasetools tool. A repository that keeps no such file is
one project at its root.

```yaml
# How this repository releases, read by every releasetools tool.
#
# Conventions: https://github.com/releasetools/conventions
# Tools:       https://github.com/releasetools
projects:
  - path: packages/*
    manifest: package.json
    changelog: CHANGELOG.md
  - path: crates/*
    manifest: Cargo.toml

# Files whose edits do not count as a project changing. Each is matched
# against the end of a path, so README.md matches at every depth. Setting
# this replaces the default below.
ignore-files:
  - CHANGELOG.md
  - README.md
  - LICENSE

# Match those patterns exactly rather than ignoring case.
case-sensitive: false

conventions:
  except: []
```

`path` takes one name or a list, as paths or globs. `manifest` takes one name
or a list, and a directory two groups reach belongs to the first.

A convention named under `conventions.except` is one no tool checks. This
guard reads `bump-from-type`: excepting it drops the table above, and the
older rule applies instead:
anything that changed beyond the files a release writes has to move the
version at all.

The action's one input is `base`, the ref to compare against, for the runs
that are not pull requests.

## Where the version comes from

Every manifest a project holds has to declare the same version, because
whichever one a client reads is the one that decides whether it updates. One
it does not hold is not its business. A group that names none is read from
`package.json`, `pyproject.toml`, `Cargo.toml` or `VERSION`.

Any `.json` takes its top-level `version`, `.toml` the version of its
`package`, `project`, `tool.poetry` or `workspace.package` table, `.yaml` a
top-level `version:`, `.properties` a `version=` line, and anything else is a
file holding the version and nothing else.

A version that is not a semantic one fails naming it. `1.0` and `v1.2` are not
versions a range, a lockfile or a resolver can read.

## Untyped history

Where no change in the range carries a type, there is nothing to read, and the
older rule applies. A repository adopts `typed-change` when it is ready, and
this keeps working meanwhile.

## Turning it off for one pull request

Label it `skip-versions-guard`. The action posts a notice saying it skipped,
so a check somebody turned off is visible on the pull request that turned it
off. The changelog guard has its own label, so one can be skipped without the
other.

## License

Apache 2.0. See [LICENSE](../LICENSE).
