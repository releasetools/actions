# `verify-signed-push`

Check a commit that [`signed-push`](../signed-push/) made into a mirror of one directory of another repository. The
commit passes when GitHub signed it for the publishing App, its `Source-Commit` trailer names a commit on the source
repository's default branch, and its tree is exactly that directory. Every check is a REST API request: nothing is cloned
or checked out, and a run makes four to six of them.

## Quick start

Publish with `signed-push`, naming the source commit in the body:

```yaml
- uses: releasetools/actions/signed-push@v0
  with:
    source-dir: plugin
    target-repo: my-org/plugin
    headline: "publish: ${{ github.ref_name }}"
    body: |
      Source-Commit: <${{ github.server_url }}/${{ github.repository }}/commit/${{ github.sha }}>
    tag: ${{ github.ref_name }}
    token: ${{ steps.app-token.outputs.token }}
```

Then verify it before anything uses it, in the mirror's own workflow or anywhere else:

```yaml
permissions: {}

jobs:
  provenance:
    runs-on: ubuntu-24.04
    steps:
      - uses: releasetools/actions/verify-signed-push@v0
        id: verified
        with:
          source-repository: my-org/mono
          source-path: plugin
          publisher: my-release-app[bot]
```

`steps.verified.outputs.commit-sha` is the commit that passed. Check out that SHA rather than a branch, which may have
moved since.

## What it refuses

In this order, stopping at the first:

| Refusal | Why |
| --- | --- |
| a signature GitHub does not verify | anyone can write any author into a commit |
| a verified signature GitHub did not make | `signed-push` commits are signed by GitHub, whose committer is `web-flow` |
| an author other than `publisher` | GitHub signs for an App only when the request names no author, so the author is the App whose token made the commit |
| no `Source-Commit` trailer, two of them, or one naming another repository or less than a full SHA | the trailer is the claim being checked, so it has to be one exact claim |
| a `source-commit` input the trailer does not name | the caller's expectation is checked against the trailer and never replaces it |
| a source commit the default branch does not contain | GitHub serves objects from a whole fork network, so this runs before any lookup by SHA |
| a `tag` that is missing, lightweight, unverified, or names another commit | the release the caller expects has to be one the source signed and tagged |
| a tree other than the source directory's | git trees are content-addressed, so one SHA covers every path, byte, executable bit and symlink |

On a tree mismatch the log lists each path that differs: `-` for one missing from the mirror, `+` for one the source
does not have, `~` for different contents or mode.

The action does not check who triggered the run, and it does not keep its own list of who may sign a tag. GitHub
already decides both: who may push to the mirror or dispatch its workflows, and, through a tag ruleset, who may create
a release tag and whether it must be signed.

## Inputs

| Input | Default | Effect |
| --- | --- | --- |
| `source-repository` | required | `owner/repo` the commit was published from. |
| `source-path` | required | Directory of the source the commit holds. `.` for the whole repository. |
| `publisher` | required | Login that authored the commit, such as `my-app[bot]`. |
| `repository` | `github.repository` | `owner/repo` that `signed-push` committed to. |
| `commit` | `github.sha` | The commit to verify: a full SHA, or a branch or tag naming it. |
| `source-commit` | `""` | The source commit the caller expects, as a full SHA. |
| `tag` | `""` | A tag of the source repository that must name the source commit. |
| `token` | `github.token` | Token for the API requests. Empty sends them unauthenticated. |

## Outputs

| Output | Meaning |
| --- | --- |
| `commit-sha` | The verified commit, as a full SHA. |
| `source-commit` | The source commit whose directory it holds. |

## Token

Reading a public repository needs no permissions, so the job can declare `permissions: {}`. The token only lifts the
rate limit: GitHub allows 60 unauthenticated requests an hour from one address, and hosted runners share addresses. A
private source or mirror needs a token that can read both, such as a GitHub App installation token.

## Limits

- The mirror must hold the source directory and nothing else. A file generated while publishing, which the source
  does not commit, fails the tree check, so commit it in the source instead.
- `signed-push` skips symlinks, so a source directory holding one never matches its mirror.
- GitHub truncates recursive tree listings past about 100,000 entries. That affects only the list of differing paths;
  the tree comparison itself is one SHA against another.

## License

Apache 2.0. See [LICENSE](../LICENSE) at the repository root.
