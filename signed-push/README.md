# `signed-push`

Commit a directory tree to a branch on any repo. The commit is signed server-side by the GitHub App whose token you pass in. Optionally creates a lightweight tag at the new commit.

## What it does

You point the action at a local directory and a target repo. It walks the directory, sends every file as a base64 addition through GitHub's `createCommitOnBranch` GraphQL mutation, and (with `prune: true`) sends every target file that isn't in your source as a deletion. The mutation runs server-side, so the resulting commit shows as Verified in the GitHub UI without any GPG key on the runner.

If you also pass a `tag`, the action creates a lightweight tag at the new commit. Re-running with a tag that already exists is treated as success.

## Usage

### Full sync (replace branch contents)

```yaml
- uses: actions/create-github-app-token@v3
  id: app-token
  with:
    client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
    private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
    owner: my-org
    repositories: my-target-repo

- uses: releasetools/actions/signed-push@v0
  with:
    source-dir: ./dist
    target-repo: my-org/my-target-repo
    target-branch: main
    headline: "publish: v${{ github.ref_name }}"
    body: |
      Source-Tag: <${{ github.server_url }}/${{ github.repository }}/releases/tag/${{ github.ref_name }}>
    tag: ${{ github.ref_name }}
    token: ${{ steps.app-token.outputs.token }}
```

The commit replaces every file on `main` with what's in `./dist`, then creates `refs/tags/v1.2.3` at the new commit.

### Upsert one file (no deletion of other files)

```yaml
- uses: releasetools/actions/signed-push@v0
  with:
    source-dir: ./Casks       # contains only Casks/myapp.rb
    target-repo: my-org/homebrew-tap
    headline: "fix: update Darwin checksums for v1.2.3"
    prune: false              # leave other files in the tap alone
    token: ${{ steps.app-token.outputs.token }}
```

With `prune: false`, the action only commits additions. Files on the target that aren't in your source-dir stay where they are.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `source-dir` | yes | — | Local directory whose contents go into the commit. `.git/` is always skipped. |
| `target-repo` | yes | — | `owner/repo` of the destination. |
| `target-branch` | no | `main` | Branch to commit on. |
| `headline` | yes | — | Commit message headline. |
| `body` | no | `""` | Optional custom commit message body. Workflow metadata is always appended automatically. |
| `prune` | no | `true` | When true, deletes target files absent from source-dir. When false, additions only. |
| `tag` | no | `""` | Lightweight tag to create at the new commit. Idempotent when the tag already exists. |
| `token` | no | — | Token with `contents:write` on target-repo. App installation tokens make the commit Verified. |

The action always appends these references to every commit body:

```text
Workflow-Commit: <https://github.com/my-org/source-repo/commit/abc1234>
Published-By: <https://github.com/my-org/source-repo/actions/runs/123456>
```

They identify the revision GitHub ran and the workflow run that invoked the
action. When `body` contains custom content, it comes first and is separated
from the inferred footer by a blank line and `---`. Custom body URLs should also
be wrapped in angle brackets so GitHub displays them as autolinks.

For `pull_request` workflows, `Workflow-Commit` is normally GitHub's synthetic
merge commit. The PR's actual head revision is available separately as
`${{ github.event.pull_request.head.sha }}` and its repository as
`${{ github.event.pull_request.head.repo.full_name }}`. Use both values when
constructing a head-commit URL because the pull request may originate from a
fork.

## Outputs

| Output | Description |
|---|---|
| `commit-sha` | SHA of the new commit. When the action no-ops (nothing to add and nothing to delete), this is the existing branch HEAD. |
| `commit-url` | `https://github.com/<owner>/<repo>/commit/<sha>` for convenience. |

## Behavior

### Server-signing

The commit shows as Verified when the token belongs to a GitHub App. A bot user or PAT works too, but the commit will not show as signed.

### Race protection

The action fetches the target branch's HEAD oid right before sending the mutation and passes it as `expectedHeadOid`. If something else pushes to the branch in that window, the API rejects the mutation and the action fails. Better that than silently overwriting someone else's work.

### No-op handling

If source-dir is empty and prune produces no deletions, the action skips the commit and sets `commit-sha` to the existing branch HEAD. When source-dir has files whose contents match the target exactly, the API still creates a commit (the tree is identical to its parent). For strict no-op behavior in that case, compare blob SHAs yourself before invoking the action.

### Tree size limit

The action uses the recursive Trees API (`/git/trees/{ref}?recursive=1`), which truncates around 100,000 entries or 7 MB. If your target repo is bigger, the action throws. File an issue if you hit this.

### Large files

`createCommitOnBranch` accepts file contents inline as base64 in the GraphQL variables. There's a practical request-size ceiling around 10–50 MB total payload. Most release artifacts (cask files, single-file binaries, small wheels) are well under this; very large trees need chunking, which the action does not currently do.

## Permissions

The token needs `contents: write` on the target repo. If you're publishing to a different repo than the one the workflow runs in, mint a GitHub App installation token scoped to the target.

## Why signed server-side

Runner-side GPG signing means a private key on the runner. Three options, all bad: commit it (don't), pull from a secret on every job (key-rotation friction plus leak surface), or trust the actor's local config (fine for a human, useless for CI). `createCommitOnBranch` sidesteps this. The App's key lives in GitHub. The mutation is attributed to the App. GitHub signs the commit server-side. The runner never sees a key.

## License

Apache 2.0. See [LICENSE](../LICENSE) at the repo root.
