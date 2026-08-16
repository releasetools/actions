# releasetools/actions

Small GitHub Actions for release pipelines. One subdirectory per action.

## Available actions

| Action | What it does |
|---|---|
| [`signed-push`](signed-push/) | Commit a directory tree to a branch on any repo, signed server-side by the calling GitHub App. Can also tag the new commit. |

More to come: `find-run` and `watch-run` for the "wait for a downstream workflow to finish" pattern.

## How tags work

Each action lives in its own subdirectory with an `action.yml` and a bundled `dist/index.js`. The repo ships one version tag at a time (currently `v0.0.1`, with a floating `v0` that follows every patch). Consumers reference an action by path:

```yaml
- uses: releasetools/actions/signed-push@v0
  with:
    source-dir: ./dist
    target-repo: my-org/my-cdn-repo
    headline: "publish: v1.2.3"
    body: |
      Source-Commit: ${{ github.server_url }}/${{ github.repository }}/commit/${{ github.sha }}
    tag: ${{ github.ref_name }}
    token: ${{ steps.app-token.outputs.token }}
```

Tags point at a clean orphan tree: `LICENSE`, `signed-push/{action.yml, README.md, dist/}`. No source, no node_modules, no tests, no CI. Source lives on `main`.

## Why this repo exists

GitHub's `createCommitOnBranch` GraphQL mutation produces commits that are signed server-side by the calling GitHub App. No GPG key on the runner. The plumbing to call it correctly (base64 contents, `expectedHeadOid` race protection, tree-diff for deletions) is the same every time. Wrapping it once means every release pipeline that needs signed publishes can skip the jq-and-bash dance.

## Contributing

Each action is a TypeScript entry point under `<action>/src/`, bundled with `@vercel/ncc` into `<action>/dist/index.js` at release time. Local dev:

```bash
npm ci
npm run lint           # tsc --noEmit
npm test               # vitest
npm run build          # ncc bundle into <action>/dist/
```

The `dist/` directory is gitignored on `main`. The release workflow builds it fresh on every tag.

## License

Apache 2.0. See [LICENSE](LICENSE).
