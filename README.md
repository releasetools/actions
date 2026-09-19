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

### `versions-guard`

Fail a pull request when a project changed without moving its version far
enough for what changed. How far follows from what the changes say they are,
by [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): a `fix` asks for a
patch, a `feat` for a minor, a `!` or a `BREAKING CHANGE:` footer for a major,
and the largest in the range wins.

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
check on. The baseline is the newest tag reachable from the commit rather than
the newest by date, so a backport released yesterday on a release branch is
not mistaken for this line's last release.

See the [`versions-guard` guide](versions-guard/) for the rule, the baseline,
and where a version is read from.

### `changelog-guard`

Fail a pull request that changes a project and writes nothing down about it.
The project's changelog has to carry a `##` heading naming the version its
manifest declares, which is a new heading whenever the version moved.

```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0

- uses: releasetools/actions/changelog-guard@v0
  if: github.event_name == 'pull_request'
```

Each project that failed becomes an annotation on the pull request. A group
that names no changelog owes none.

See the [`changelog-guard` guide](changelog-guard/).

### What a guard reads

Both read `.releasetools.yaml` at the repository root, the same file every
releasetools tool reads. A repository that keeps no such file is one project
at its root.

```yaml
projects:
  - path: packages/*
    manifest: package.json
    changelog: CHANGELOG.md
  - path: crates/*
    manifest: Cargo.toml
```

A project is any directory with its own version, from the repository itself to
every package in a workspace. A version is read out of `package.json`,
`pyproject.toml`, `Cargo.toml`, a `VERSION` file or whatever else a group
names, and files that are not committed yet count as well as the diff.

### `changelog-section`

Hand one version's changelog section to whatever publishes the release. It
reads the heading the way `changelog-guard` reads it, out of the same module, so
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
