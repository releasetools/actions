# `trigger-guard`

Fail a pull request when the publish workflow `.releasetools.yaml` names does
not accept what its `release.trigger` declares.

A release tool acts on that declaration. Under `tag` it pushes a version tag;
under `dispatch` it starts the workflow with a `version` and a `commit`. A
workflow that ignores the tag, or has no input to take the commit, fails at
release time, after the release commit has merged. This finds the mismatch on
the pull request that makes it.

## Quick start

```yaml
- uses: actions/checkout@v6

- uses: releasetools/actions/trigger-guard@v0
  if: github.event_name == 'pull_request'
```

The action takes no inputs. It reads `.releasetools.yaml` at the repository
root and the workflow it names under `.github/workflows/`.

## What it asks

```yaml
release:
  publish: publish.yml
  trigger: dispatch
```

| the repository declares | the publish workflow has to have |
| --- | --- |
| no `.releasetools.yaml` | nothing; the check passes and says so |
| `trigger: tag`, or no trigger, and no `publish` | nothing; the tag is the release |
| `trigger: dispatch` and no `publish` | the declaration is refused before any workflow is read |
| a `publish` file that is not there | the run fails naming it |
| `tag` among the triggers | `on.push.tags` |
| `dispatch` among the triggers | `on.workflow_dispatch.inputs.version` and `.commit`, with `commit` defaulting to `HEAD` where it has a default |

A list of both triggers checks both. The definitions are the
[releasetools conventions](https://github.com/releasetools/conventions/blob/main/FORMAT.md)'
`release` keys.

`on` can be a string, a list or a mapping. Only the mapping configures an
event, so `on: push` and `on: [push, workflow_dispatch]` fail: a bare push
starts on every branch push and names no tag, and a bare dispatch takes no
inputs.

```
Publish workflow does not match release.trigger
  .github/workflows/publish.yml has no on.workflow_dispatch.inputs.commit:
  release.trigger includes dispatch, so on.workflow_dispatch.inputs needs
  version and commit.
```

The guard checks that `on.push.tags` exists, not what its patterns match.

## License

Apache 2.0. See [LICENSE](../LICENSE).
