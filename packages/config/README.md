# `@releasetools/config`

Reading `.releasetools.yaml`, the file every releasetools tool takes its
configuration from.

One implementation, because two would be two answers to which project a change
belongs to, and the one that disagrees sends a guard to the wrong directory or
a release note to the wrong changelog. The format it reads is written down in
the [conventions](https://github.com/releasetools/conventions/blob/main/FORMAT.md),
so this answers to a specification rather than to its callers.

```js
const { settingsFrom } = require('@releasetools/config');

const declared = settingsFrom(fs.readFileSync('.releasetools.yaml', 'utf8'));
// { projects: [...], ignoreFiles: null, caseSensitive: false, except: [] }
```

Plain CommonJS with no dependencies, and no build. A Claude Code plugin is
installed as a clone of its marketplace and never runs `npm install`, so the
plugin that reads this file carries `releasetools-config.js` verbatim and
loads it with `createRequire`, rather than depending on the package.

It reads the subset of YAML the format is written in: mappings, lists, scalars
and flow lists of scalars. An anchor, a tag or a block scalar is refused by
name and line rather than guessed at.

## License

Apache 2.0. See [LICENSE](../../LICENSE).
