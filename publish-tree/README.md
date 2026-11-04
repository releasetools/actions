# `publish-tree`

Publish a dispatched release as a built tree, the way `release.trigger: dispatch` in the
[conventions](https://github.com/releasetools/conventions/blob/main/FORMAT.md#configuration) describes it. One step
refuses what does not match, commits the tree, tags it and creates the GitHub release.

## Quick start

```yaml
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to publish, with no v (e.g. 1.5.2).'
        required: true
      commit:
        description: 'The release commit: its full SHA, or HEAD.'
        required: false
        default: HEAD

run-name: Release v${{ inputs.version }}

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v6
      - run: npm ci && npm run build          # whatever builds ./publish
      - uses: releasetools/actions/publish-tree@v0
        with:
          version: ${{ inputs.version }}
          commit: ${{ inputs.commit }}
          source-dir: publish
```

A job that needs the tag, such as an npm publish kept apart from `npm ci`, runs after this one and checks out
`v${{ inputs.version }}`.

## What it refuses

Before anything is published, and all of them in one run:

| Refusal | Why |
| --- | --- |
| `version` that is not a bare semantic version | `v1.5.2` here would become the tag `vv1.5.2` |
| `commit` that is not the commit the run checked out | the branch moved after the release merged; dispatch on a ref that names it |
| a manifest declaring another version | the manifests `.releasetools.yaml` names for the repository's own project |
| `v<version>` already exists | [`immutable-tag`](https://github.com/releasetools/conventions/blob/main/conventions/immutable-tag.md) |
| `replace` where `.releasetools.yaml` does not except `immutable-tag` | moving a tag is the repository's declared choice |
| no changelog section for the version | the release notes come from it |

`dry-run: true` runs every check and prints the notes without writing anything.

## What it publishes

1. `release/v<major>`, or `target-branch`, created as a parentless placeholder commit when missing, since a workflow's
   own token cannot create a branch from a commit carrying workflow files.
2. One commit holding `source-dir`, through the same code as [`signed-push`](../signed-push/): server-signed, every
   file keeping its executable bit, and a `Source-Commit` trailer naming the release commit, which is what
   [`traceable-tag`](https://github.com/releasetools/conventions/blob/main/conventions/traceable-tag.md) asks of a tag
   on a built tree.
3. `v<version>` on that commit, and `v<major>` moved onto it unless `major-tag: false`.
4. The GitHub release, titled `release-name` or `v<version>`, whose body is the changelog section without its `###`
   headings, or `empty-notes` for a section with no entries.

A tag created with the workflow's own token starts no workflow, so anything that should run after publication runs in
the same workflow.

## Inputs

| Input | Default | Effect |
| --- | --- | --- |
| `version` | required | The version, with no `v`. |
| `commit` | `HEAD` | The release commit's full SHA, or `HEAD` for whatever the run checked out. |
| `source-dir` | required | The built tree. Every file is committed; `.git/` and symlinks are skipped. |
| `target-branch` | `release/v<major>` | Where the tree is committed. |
| `major-tag` | `true` | Move `v<major>` onto the published commit. |
| `release-name` | `v<version>` | The GitHub release title. |
| `empty-notes` | `No user-visible changes.` | The release body for a section with no entries. |
| `replace` | `false` | Replace an existing `v<version>` and its release. Refused unless `immutable-tag` is excepted. |
| `dry-run` | `false` | Check and report only. |
| `token` | `github.token` | Needs `contents: write`. |

Outputs: `tag`, `major`, `commit-sha`, `commit-url`, and `replaced`, the commit `v<version>` named before when
`replace` moved it.
