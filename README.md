# releasetools/actions

Small, focused GitHub Actions for release pipelines. The current release is
[`v0.0.6`](https://github.com/releasetools/actions/releases/tag/v0.0.6); use
`v0` to follow compatible updates on the current major line.

## Actions

### `signed-push`

Publish a local directory to a branch in any repository with a commit signed
server-side by GitHub. It can replace the branch contents, update only the files
you provide, and attach one or more lightweight tags to the resulting commit.

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
    headline: "publish: v1.2.3"
    tags: |
      v1.2.3
      v1
    force-tags: true
    token: ${{ steps.app-token.outputs.token }}
```

The action uses GitHub's `createCommitOnBranch` GraphQL mutation, so a GitHub
App token produces a Verified commit without placing a private signing key on
the runner. It also handles base64 file contents, race protection, pruning, and
tag creation—the repetitive plumbing that otherwise ends up in every release
workflow.

See the [`signed-push` guide](signed-push/) for mirroring, upserts, inputs,
outputs, permissions, and behavior.

### `changelog-guard`

Fail a pull request when a project changed without recording it: its manifest
version has to move, and its `CHANGELOG.md` has to open a section for the
version it now claims. A project is any directory with its own version, from the
repository itself to every package in a workspace.

```yaml
- uses: actions/checkout@v6
  with:
    # The check compares this tree against the base branch, so it needs both.
    fetch-depth: 0

- uses: releasetools/actions/changelog-guard@v0
  if: github.event_name == 'pull_request'
  with:
    # Omit for a repository that is one versioned thing.
    projects: packages/*
```

A pull request already says what it is against, so there is nothing else to
configure.

Each project that failed the rule becomes an annotation on the pull request. The
same check installs from npm as `@releasetools/changelog-guard`, so a maintainer
can run `changelog-guard --base origin/main` before pushing instead of hearing
about it from CI, and the command also sees files that are not committed yet.

See the [`changelog-guard` guide](changelog-guard/) for project globs, the rule,
the inputs, and the exit codes.

More actions are planned for common cross-workflow release patterns.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository layout, local
development commands, and how action releases are assembled.

## License

Apache 2.0. See [LICENSE](LICENSE).
