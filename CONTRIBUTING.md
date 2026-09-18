# Contributing

Thanks for helping improve `releasetools/actions`.

## Repository layout

Each action lives in its own subdirectory with an `action.yml`, TypeScript
source, tests, and a user-facing README. The root `package.json` holds the shared
build and test toolchain.

Source lives on `main`. Generated `dist/` bundles are gitignored there and are
built fresh by the release workflow.

## Local development

```bash
npm ci
npm run lint
npm test
npm run build
```

Add or update tests alongside behavior changes. `npm run build` verifies that
`@vercel/ncc` can bundle the Node action, but the generated bundle is not
committed to `main`.

## Release layout

The release workflow builds every action and stages a clean artifact tree
containing only `LICENSE`, the release README, and each action's `action.yml`,
README, and `dist/` bundle. It publishes that tree to `release/<major>` using
`signed-push` itself.

Two kinds of repository tag point at the published tree:

- An exact version such as `v0.0.6` identifies one release.
- A floating major such as `v0` moves to the latest release on that major line.

Consumers select an action by subdirectory and version, for example
`releasetools/actions/signed-push@v0`. The published tree intentionally excludes
source, tests, dependencies, and CI configuration.

The same run publishes `changelog-guard`'s CLI to npm as
`@releasetools/changelog-guard`, at the version being released without its
leading `v`, so a repository being checked can hold it as a devDependency and
run it before pushing. Authentication is npm trusted publishing: the job's
`id-token: write` permission is enough, and the workflow filename registered on
npmjs.com is `release.yml`.

OIDC cannot create a package that does not exist, so a name's first version is
published by hand and every later one by the workflow. Both assemble the same
tree with the same script:

```bash
npm run package:npm -- --version 0.1.0
node npm/changelog-guard.js   # exits 2 with no --base, which is the smoke test
npm publish npm --access public
```

To publish, dispatch `.github/workflows/release.yml` with a version matching
`vMAJOR.MINOR.PATCH`. The workflow validates, tests, builds, publishes, and moves
both tags.
