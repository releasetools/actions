# Changelog

## 0.2.0 - 2026-09-20

### Added

`npx @releasetools/config adopt` writes a starter `.releasetools.yaml`
from the repository's manifests and changelog. It preserves an existing
configuration and prints the plugin commands for the user to run.

Use `--dir` to target another checkout and repeat `--plugin` to choose
the plugins to declare.
