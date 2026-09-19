# `changelog-section`

Hand one version's changelog section to whatever publishes the release.

A release that writes its own notes and a check that reads the changelog are
two answers to "is this release written down", and the pair that disagrees is
the one nobody notices. This reads the heading the way
[`changelog-guard`](../changelog-guard/) reads it, out of the same module, so the
entry a pull request was made to write is the entry the release publishes.

## Quick start

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

Through a file and an environment variable, because the notes are Markdown
somebody wrote and neither a shell nor a YAML expression should be asked to
carry it intact.

## Refusing a release nothing describes

`found` says whether there was a section at all, so a workflow decides for
itself what that means:

```yaml
- uses: releasetools/actions/changelog-section@v0
  id: notes
  with:
    version: ${{ inputs.version }}

- if: steps.notes.outputs.found != 'true'
  run: |
    echo "::error::Write the ${{ inputs.version }} section, then release."
    exit 1
```

The action itself never fails on a missing section. A release workflow wants
to stop; a draft might want to carry on and say so.

## What counts as a section

The heading, then every line up to the next `## `, trimmed.

| heading | for version `0.2.0` |
| --- | --- |
| `## 0.2.0` | found |
| `## 0.2.0 - 2026-09-19` | found, which is what the release-notes plugin writes |
| `## [0.2.0] - 2026-09-19` | found, which is what Keep a Changelog writes |
| `## v0.2.0` | found |
| `## 0.2.0-rc1` | not this version |
| `### 0.2.0` | not a section |

A leading `v` on the `version` input is dropped, so `v0.2.0` and `0.2.0` ask
the same question.

## Inputs and outputs

| input | default | |
| --- | --- | --- |
| `version` | required | the version whose section to read, with or without a leading `v` |
| `changelog` | `CHANGELOG.md` | the file to read, relative to the working directory |

| output | |
| --- | --- |
| `notes` | the lines under that version's heading, empty when there is none |
| `found` | whether the changelog carries a section for that version |

## What it will not do

It reads. It never writes a changelog, never creates a release, and never
decides what a missing section means.

## License

Apache 2.0. See [LICENSE](../LICENSE).
