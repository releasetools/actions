import { parseArgs } from 'node:util';
import { checkRelease, DEFAULTS, UsageError } from './check-release';

/** Where the CLI writes. The tests pass their own. */
export interface Streams {
  out: (text: string) => void;
  err: (text: string) => void;
}

const OPTIONS = {
  base: { type: 'string' },
  root: { type: 'string' },
  'plugins-dir': { type: 'string' },
  manifest: { type: 'string' },
  changelog: { type: 'string' },
  ignore: { type: 'string', multiple: true },
} as const;

const USAGE = `Usage: plugin-release --base <ref> [options]

  --base <ref>          required, for example origin/main
  --root <dir>          repository root (default: the working directory)
  --plugins-dir <dir>   default: ${DEFAULTS.pluginsDir}
  --manifest <path>     default: ${DEFAULTS.manifest}
  --changelog <path>    default: ${DEFAULTS.changelog}
  --ignore <path>       a file whose edits are not a release, repeatable
                        (default: ${DEFAULTS.ignore.join(', ')}). Pass an
                        empty one to count every file.
`;

/** Runs the check and returns the exit code: 0 pass, 1 failed, 2 usage. */
export function runCli(argv: string[], streams: Streams): number {
  let values: ReturnType<typeof parse>;
  try {
    values = parse(argv);
  } catch (err) {
    return usage(streams, err instanceof Error ? err.message : String(err));
  }

  let result;
  try {
    result = checkRelease({
      root: values.root ?? process.cwd(),
      base: values.base ?? '',
      pluginsDir: values['plugins-dir'],
      manifest: values.manifest,
      changelog: values.changelog,
      // `--ignore ''` is how a caller asks for every file to count, so an
      // empty value is a deliberate empty list rather than no answer.
      ignore: values.ignore?.filter((entry) => entry.trim() !== ''),
    });
  } catch (err) {
    if (err instanceof UsageError) {
      return usage(streams, err.message);
    }
    throw err;
  }

  for (const line of result.released) {
    streams.out(`${line}\n`);
  }

  if (result.errors.length > 0) {
    streams.err('Release check failed:\n');
    for (const error of result.errors) {
      streams.err(`- ${error}\n`);
    }
    return 1;
  }

  streams.out(
    result.released.length === 0
      ? 'No plugin changed\n'
      : 'Every changed plugin declared its release\n',
  );
  return 0;
}

function parse(argv: string[]) {
  return parseArgs({ args: argv, options: OPTIONS }).values;
}

function usage(streams: Streams, problem: string): number {
  streams.err(`plugin-release: ${problem}\n\n${USAGE}`);
  return 2;
}
