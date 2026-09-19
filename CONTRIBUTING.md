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

- An exact version such as `v0.1.0` identifies one release and is written
  once. Releasing a version that already has a tag fails, so what somebody
  pinned cannot change underneath them. A run that died after tagging needs
  the tag deleted by hand, which is the deliberate act it should be.
- A floating major such as `v0` moves to the latest release on that major line.

Consumers select an action by subdirectory and version, for example
`releasetools/actions/signed-push@v0`. The published tree intentionally excludes
source, tests, dependencies, and CI configuration.

Every release is described in `CHANGELOG.md` before it is cut. The workflow
refuses a version the changelog has no section for, and publishes that same
section as the release notes, so the file and the release page cannot say
different things about one version. `.github/changelog-section.awk` is the one
reader both steps use.

To publish, write the section, then dispatch `.github/workflows/release.yml`
with a version matching `vMAJOR.MINOR.PATCH`. The workflow validates, tests,
builds, publishes the tree, moves the floating major, writes the exact tag, and
creates the release.
