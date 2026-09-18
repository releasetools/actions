import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { baseSha } from '../src/event';

describe('baseSha', () => {
  const written: string[] = [];

  function event(payload: string): void {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'event-')), 'event.json');
    fs.writeFileSync(file, payload);
    written.push(file);
    process.env['GITHUB_EVENT_PATH'] = file;
  }

  afterEach(() => {
    delete process.env['GITHUB_EVENT_PATH'];
    for (const file of written.splice(0)) {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  it('reads what the pull request is against', () => {
    event(JSON.stringify({ pull_request: { base: { sha: 'abc123' } } }));

    expect(baseSha()).toBe('abc123');
  });

  it('has nothing to say on an event that is not a pull request', () => {
    event(JSON.stringify({ ref: 'refs/heads/main' }));

    expect(baseSha()).toBeUndefined();
  });

  it('has nothing to say on a pull request with no base', () => {
    event(JSON.stringify({ pull_request: { labels: [] } }));

    expect(baseSha()).toBeUndefined();
  });

  it('has nothing to say outside Actions', () => {
    delete process.env['GITHUB_EVENT_PATH'];

    expect(baseSha()).toBeUndefined();
  });

  it('has nothing to say rather than throwing on an unreadable event file', () => {
    event('{ not json');

    expect(baseSha()).toBeUndefined();
  });
});
