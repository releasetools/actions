import { runCli } from './cli';

// exitCode rather than exit(): stdout is still draining on a pipe.
process.exitCode = runCli(process.argv.slice(2), {
  out: (text) => {
    process.stdout.write(text);
  },
  err: (text) => {
    process.stderr.write(text);
  },
});
