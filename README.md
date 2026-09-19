# releasetools/actions

Small, focused GitHub Actions for release pipelines. Use `v0` to follow
compatible updates on the current major line, or pin an exact version, which is
written once and never moves. The [releases](https://github.com/releasetools/actions/releases)
say what each one changed.

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

### `release-guard`

Fail a pull request when a project changed without recording it: its manifest
version has to move, and its `CHANGELOG.md` has to open a section for the
version it now claims. A project is any directory with its own version, from the
repository itself to every package in a workspace.

```yaml
- uses: actions/checkout@v6
  with:
    # The check compares this tree against the base branch, so it needs both.
    fetch-depth: 0

- uses: releasetools/actions/release-guard@v0
  if: github.event_name == 'pull_request'
  with:
    # Omit entirely for a repository that is one versioned thing.
    projects: |
      - path: packages/*
        manifest: package.json
        changelog: CHANGELOG.md
      - path: crates/*
        manifest: Cargo.toml
```

A pull request already says what it is against, so there is nothing else to
configure.

Each project that failed the rule becomes an annotation on the pull request. It
reads a version out of `package.json`, `pyproject.toml`, `Cargo.toml`, a
`VERSION` file or whatever else a group names, and it counts files that are not
committed yet as well as the diff.

See the [`release-guard` guide](release-guard/) for project globs, the rule,
the inputs, and the exit codes.

### `changelog-section`

Hand one version's changelog section to whatever publishes the release. It
reads the heading the way `release-guard` reads it, out of the same module, so
the entry a pull request was made to write is the entry the release publishes.

```yaml
- uses: releasetools/actions/changelog-section@v0
  id: notes
  with:
    version: ${{ inputs.version }}

- env:
    NOTES: ${{ steps.notes.outputs.notes }}
  run: |
    printf '%s\n' "$NOTES" > notes.md
    gh release create "${{ inputs.version }}" --notes-file notes.md --verify-tag
```

`found` says whether there was a section at all, so a workflow decides for
itself whether a release nothing describes should stop.

See the [`changelog-section` guide](changelog-section/).

More actions are planned for common cross-workflow release patterns.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository layout, local
development commands, and how action releases are assembled.

## License

Apache 2.0. See [LICENSE](LICENSE).
