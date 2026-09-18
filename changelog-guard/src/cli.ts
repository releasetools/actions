import { parseArgs } from 'node:util';
import { guard, DEFAULTS, UsageError } from './guard';

/** Where the CLI writes. The tests pass their own. */
export interface Streams {
  out: (text: string) => void;
  err: (text: string) => void;
}

const OPTIONS = {
  base: { type: 'string' },
  root: { type: 'string' },
  modules: { type: 'string', multiple: true },
  manifest: { type: 'string' },
  changelog: { type: 'string' },
  'ignore-files': { type: 'string', multiple: true },
  'case-sensitive': { type: 'boolean' },
} as const;

const USAGE = `Usage: changelog-guard --base <ref> [options]

  --base <ref>          required, for example origin/main
  --root <dir>          repository root (default: the working directory)
  --modules <glob>      a directory to check, repeatable (default: ${DEFAULTS.modules.join(', ')}).
                        ./ is the repository itself, ./* every directory at
                        the top, packages/* every one under packages
  --manifest <path>     relative to a module (default: ${DEFAULTS.manifest})
  --changelog <path>    relative to a module (default: ${DEFAULTS.changelog})
  --ignore-files <glob> a file whose edits are not a change, repeatable
                        (default: ${DEFAULTS.ignoreFiles.join(', ')}). Matched
                        against the end of a path, so README.md matches at
                        every depth. Pass an empty one to count every file
  --case-sensitive      match --ignore-files exactly rather than ignoring case
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
    result = guard({
      root: values.root ?? process.cwd(),
      base: values.base ?? '',
      modules: values.modules,
      manifest: values.manifest,
      changelog: values.changelog,
      // `--ignore-files ''` is how a caller asks for every file to count, so
      // an empty value is a deliberate empty list rather than no answer.
      ignoreFiles: values['ignore-files']?.filter((entry) => entry.trim() !== ''),
      caseSensitive: values['case-sensitive'] === true,
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
    streams.err('Changelog check failed:\n');
    for (const error of result.errors) {
      streams.err(`- ${error}\n`);
    }
    return 1;
  }

  streams.out(
    result.released.length === 0
      ? 'No module changed\n'
      : 'Every changed module recorded its new version\n',
  );
  return 0;
}

function parse(argv: string[]) {
  return parseArgs({ args: argv, options: OPTIONS }).values;
}

function usage(streams: Streams, problem: string): number {
  streams.err(`changelog-guard: ${problem}\n\n${USAGE}`);
  return 2;
}
