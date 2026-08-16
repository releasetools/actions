# `signed-push`

Publish a directory to a GitHub branch with a server-signed commit. Use it to
mirror a generated artifact tree, update a few files without touching anything
else, or apply one or more release tags to the resulting commit.

## Quick start

This example replaces the contents of `main`, creates an exact release tag, and
moves a floating major tag:

```yaml
- uses: actions/create-github-app-token@v3
  id: app-token
  with:
    client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
    private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
    owner: my-org
    repositories: my-target-repo

- uses: releasetools/actions/signed-push@v0
  id: publish
  with:
    source-dir: ./dist
    target-repo: my-org/my-target-repo
    target-branch: main
    headline: "publish: v1.2.3"
    body: |
      Source-Tag: <${{ github.server_url }}/${{ github.repository }}/releases/tag/${{ github.ref_name }}>
    prune: 'true'
    tags: |
      v1.2.3
      v1
    force-tags: 'true'
    token: ${{ steps.app-token.outputs.token }}
```

After the step completes:

- The target branch tree matches `./dist`.
- The new commit is signed by the identity behind the token.
- `v1.2.3` and `v1` point at that commit; existing tags move because
  `force-tags` is enabled.
- `commit-sha` and `commit-url` are available as step outputs.

## Choose how files are applied

`prune` controls the action's impact on the target branch.

### Mirror the directory

`prune: true` is the default. Every regular file under `source-dir` is added or
updated, and every target file absent from `source-dir` is deleted.

Use mirror mode for generated branches whose entire contents are owned by the
workflow. Do not use it for a shared branch unless deleting unrelated files is
intentional.

### Update only the supplied files

Set `prune: false` to add or update source files without deleting other target
files:

```yaml
- uses: releasetools/actions/signed-push@v0
  with:
    source-dir: ./Casks
    target-repo: my-org/homebrew-tap
    headline: "fix: update Darwin checksums for v1.2.3"
    prune: 'false'
    token: ${{ steps.app-token.outputs.token }}
```

## Input reference

| Input | Required | Default | Effect |
|---|---:|---|---|
| `source-dir` | yes | — | Local directory to publish. Files are mapped relative to this directory. `.git/`, symlinks, and non-regular files are skipped. |
| `target-repo` | yes | — | Destination in `owner/repo` form. The token must have write access to it. |
| `target-branch` | no | `main` | Existing branch to update. The action does not create a missing branch. |
| `headline` | yes | — | First line of the commit message. |
| `body` | no | `""` | Custom commit body placed before the action-generated workflow footer. |
| `prune` | no | `true` | Deletes target files missing from `source-dir`. Set to `false` for additions and updates only. |
| `tags` | no | `""` | One lightweight tag per line. Blank lines and duplicate names are ignored. |
| `force-tags` | no | `false` | Moves existing requested tags to the resulting commit. Without it, existing tags remain where they are. |
| `tag` | no | `""` | Singular tag shortcut. Combined with `tags` when both are supplied. |
| `token` | yes | — | Token with `contents: write` on `target-repo`. A GitHub App token makes the commit Verified. |

### `source-dir`

The directory is walked recursively and paths are published relative to its
root. Only regular files are included. The `.git` directory is always skipped;
symlinks, sockets, devices, and other special entries are ignored.

The directory must exist. An empty directory is valid, but with `prune: true`
it means "delete every file from the target branch."

### `body` and generated metadata

The action always identifies the workflow revision and run that produced its
commit:

```text
Workflow-Commit: <https://github.com/my-org/source-repo/commit/abc1234>
Published-By: <https://github.com/my-org/source-repo/actions/runs/123456>
```

Custom `body` content comes first and is separated from this footer:

```text
Changes: <https://github.com/my-org/source-repo/compare/v1.2.2...v1.2.3>

---

Workflow-Commit: <https://github.com/my-org/source-repo/commit/abc1234>
Published-By: <https://github.com/my-org/source-repo/actions/runs/123456>
```

For a `pull_request` workflow, `Workflow-Commit` normally identifies GitHub's
synthetic merge commit. The PR head is available separately as
`${{ github.event.pull_request.head.sha }}` and its repository as
`${{ github.event.pull_request.head.repo.full_name }}`. Use both when building a
head-commit URL because the PR may come from a fork.

### `tags`, `tag`, and `force-tags`

Use `tags` for one or more names:

```yaml
tags: |
  v1.2.3
  v1
  stable
force-tags: 'true'
```

The action combines `tags` with the singular `tag` shortcut, trims the values,
removes duplicates, and processes the remaining names in order. Each operation
is retried once.

By default, a new tag is created and an existing tag is left unchanged. Set
`force-tags: true` when every requested tag must point at the resulting commit,
such as for floating `v1` or `stable` tags. Tags are not transactional: if an
operation fails twice, earlier tags remain applied and later tags are skipped.
Re-running with `force-tags: true` converges all requested tags on the latest
resulting commit.

## Outputs

| Output | Meaning |
|---|---|
| `commit-sha` | SHA of the newly created commit, or the existing branch HEAD in the explicit no-op case. |
| `commit-url` | GitHub URL for `commit-sha`. |

Reference an output through the step ID, for example
`${{ steps.publish.outputs.commit-sha }}`.

## Permissions and signing

The token needs `contents: write` on `target-repo`. For a different target
repository, scope the GitHub App installation token to that repository.

GitHub's `createCommitOnBranch` GraphQL mutation creates the commit server-side.
With a GitHub App token, GitHub signs it and the UI shows it as Verified. A PAT
or bot token can write the same commit, but it may not carry a verified
signature.

No private signing key is installed on or exposed to the runner.

## Execution and failure behavior

The action:

1. Reads and base64-encodes the regular files under `source-dir`.
2. Reads the current target branch HEAD.
3. Computes deletions when `prune` is enabled.
4. Creates the commit with that HEAD as `expectedHeadOid`.
5. Applies requested tags to the resulting commit.

If another writer moves the branch after step 2, GitHub rejects the commit
instead of allowing this action to overwrite the newer branch state.

If the source contains no files and pruning finds nothing to delete, no commit
is created. Outputs refer to the existing branch HEAD, and requested tags are
still applied to that HEAD. Files whose contents already match the target do
not trigger this explicit no-op path; GitHub can still create a commit with an
unchanged tree.

Tag operations happen after the branch commit. A tag failure therefore fails
the action but does not roll back the commit or any earlier tag operation.

## Limits

- Target enumeration uses GitHub's recursive Trees API. The action fails rather
  than proceeding when GitHub reports a truncated tree, typically around
  100,000 entries or a 7 MB response.
- File contents are sent inline as base64 in one GraphQL mutation. Very large
  artifact trees can exceed GitHub's request-size limits and are not chunked.
- The target branch must already exist.

## License

Apache 2.0. See [LICENSE](../LICENSE) at the repository root.
