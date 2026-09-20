# Contributing

Thanks for helping improve `releasetools/actions`.

## Repository layout

Each action lives in its own subdirectory with an `action.yml`, TypeScript
source, tests, and a user-facing README. The root `package.json` holds the shared
build and test toolchain.

`lib/` is what more than one action needs. `lib/src/scan.ts` finds the projects
a change touched, and both guards start there; `lib/src/changelog.ts` is the
single reader behind `changelog-guard` asking whether a release is written down
and `extract-release-notes` handing over the lines. Two readers would be two
answers to one question. Nothing lands there until a second action needs it,
and nothing in `lib/` is published: each action bundles what it imports.

`packages/config` is the reader for `.releasetools.yaml`, published to npm as
`@releasetools/config` by `.github/workflows/publish-config.yml` on its own
version. [Publishing it](#publishing-releasetoolsconfig) is a dispatch. The release-notes plugin carries the same file byte for byte, because
a Claude Code plugin installs as a clone of its marketplace and never runs
`npm install`. Change it here, publish, then copy it there.

Source lives on `main`. Generated `dist/` bundles are gitignored there and are
built fresh by the release workflow.

Dependencies are Renovate's, through the org baseline in
[releasetools/.github](https://github.com/releasetools/.github). It rolls
routine Actions bumps into a weekly pull request, maintains the lock file, and
pins action digests. `undici` reaches the published bundles through
`@actions/core` and `@actions/github`, so a bump there is a bump in what
every action ships, and its pull request is worth reading rather than merging
on sight.

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

## Publishing `@releasetools/config`

Dispatch `.github/workflows/publish-config.yml` with the version
`packages/config/package.json` declares. The workflow refuses any other
version, refuses one npm already carries, and runs the lint and the tests
first, because the guards read the file through this package.

Authentication is [trusted publishing](https://docs.npmjs.com/trusted-publishers):
no token in the repository, an OIDC token minted per run from the
`id-token: write` permission, and provenance generated from the same identity.

That is already configured, as:

| field | value |
| --- | --- |
| Organization or user | `releasetools` |
| Repository | `actions` |
| Workflow filename | `publish-config.yml` |
| Environment | empty |

Renaming the workflow file breaks it, and npm says nothing until a publish
fails, so rename the trusted publisher on npmjs.com in the same change.

Every publish carries provenance linking the tarball to the commit and the run
that built it, and no long-lived credential exists in this repository to leak.

A package that does not exist yet cannot have a trusted publisher, so a new
package is created by publishing its first version from a machine with `npm
login` and a one-time password, and configured afterwards.

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
different things about one version. The workflow reads it through the
`extract-release-notes` action this repository ships, so the release dogfoods the
same heading rule `changelog-guard` applies to every pull request.

`package.json` declares the version this repository is on, which is what the
guards judge a pull request against, so the workflow refuses to release a
version it does not name. Bump it in the pull request that earns the bump.

To publish, write the section, then dispatch `.github/workflows/release.yml`
with a version matching `vMAJOR.MINOR.PATCH`. The workflow validates, tests,
builds, publishes the tree, moves the floating major, writes the exact tag, and
creates the release.
