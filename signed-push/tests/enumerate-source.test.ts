import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { enumerateSource } from '../src/enumerate-source';

describe('enumerateSource', () => {
  let work: string;

  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), 'enum-src-'));
  });

  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  it('walks a flat directory and base64-encodes each file', async () => {
    await fs.writeFile(path.join(work, 'a.txt'), 'alpha\n');
    await fs.writeFile(path.join(work, 'b.txt'), 'beta\n');

    const out = await enumerateSource(work);

    expect(out).toEqual([
      {
        path: 'a.txt',
        contents: Buffer.from('alpha\n').toString('base64'),
        mode: '100644',
        sha: '4a58007052a65fbc2fc3f910f2855f45a4058e74',
      },
      {
        path: 'b.txt',
        contents: Buffer.from('beta\n').toString('base64'),
        mode: '100644',
        sha: '65b2df87f7df3aeedef04be96703e55ac19c2cfb',
      },
    ]);
  });

  it('marks a file with an execute bit as 100755', async () => {
    await fs.writeFile(path.join(work, 'run.sh'), '#!/bin/sh\n');
    await fs.chmod(path.join(work, 'run.sh'), 0o755);
    await fs.writeFile(path.join(work, 'notes.md'), 'notes');
    await fs.chmod(path.join(work, 'notes.md'), 0o644);

    const out = await enumerateSource(work);

    expect(out.map((e) => [e.path, e.mode])).toEqual([
      ['notes.md', '100644'],
      ['run.sh', '100755'],
    ]);
  });

  it('recurses into subdirectories with forward-slash paths', async () => {
    await fs.mkdir(path.join(work, 'sub', 'nested'), { recursive: true });
    await fs.writeFile(path.join(work, 'top.md'), 'top');
    await fs.writeFile(path.join(work, 'sub', 'mid.md'), 'mid');
    await fs.writeFile(path.join(work, 'sub', 'nested', 'deep.md'), 'deep');

    const out = await enumerateSource(work);

    expect(out.map((e) => e.path)).toEqual(['sub/mid.md', 'sub/nested/deep.md', 'top.md']);
  });

  it('skips the .git directory at any depth', async () => {
    await fs.mkdir(path.join(work, '.git', 'objects'), { recursive: true });
    await fs.writeFile(path.join(work, '.git', 'HEAD'), 'ref: refs/heads/main');
    await fs.writeFile(path.join(work, '.git', 'objects', 'pack'), 'blob');
    await fs.writeFile(path.join(work, 'real.txt'), 'kept');

    const out = await enumerateSource(work);

    expect(out.map((e) => e.path)).toEqual(['real.txt']);
  });

  it('produces a deterministic sort order independent of fs walk order', async () => {
    // Create files in scrambled order
    await fs.writeFile(path.join(work, 'z.txt'), 'z');
    await fs.writeFile(path.join(work, 'a.txt'), 'a');
    await fs.writeFile(path.join(work, 'm.txt'), 'm');

    const out = await enumerateSource(work);

    expect(out.map((e) => e.path)).toEqual(['a.txt', 'm.txt', 'z.txt']);
  });

  it('throws a clear error when source-dir does not exist', async () => {
    await expect(enumerateSource(path.join(work, 'nope'))).rejects.toThrow(/source-dir does not exist/);
  });

  it('returns empty array for an empty directory', async () => {
    const out = await enumerateSource(work);
    expect(out).toEqual([]);
  });

  it('handles binary files via base64 round-trip', async () => {
    const bytes = Buffer.from([0x00, 0x01, 0xff, 0x80, 0x7f]);
    await fs.writeFile(path.join(work, 'bin.dat'), bytes);

    const out = await enumerateSource(work);

    expect(out).toHaveLength(1);
    expect(Buffer.from(out[0]!.contents, 'base64')).toEqual(bytes);
  });
});
