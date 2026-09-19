import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { skipRequested } from '../src/skip';

describe('skipRequested', () => {
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

  it('skips a pull request carrying the label', () => {
    event(JSON.stringify({ pull_request: { labels: [{ name: 'skip-versions-guard' }] } }));

    expect(skipRequested('skip-versions-guard')).toBe(true);
  });

  it('skips one guard without skipping the other', () => {
    event(JSON.stringify({ pull_request: { labels: [{ name: 'skip-changelog-guard' }] } }));

    expect(skipRequested('skip-changelog-guard')).toBe(true);
    expect(skipRequested('skip-versions-guard')).toBe(false);
  });

  it('checks a pull request carrying other labels', () => {
    event(JSON.stringify({ pull_request: { labels: [{ name: 'bug' }] } }));

    expect(skipRequested('skip-versions-guard')).toBe(false);
  });

  it('accepts bare strings, since a hand-built payload is somebody else’s shape', () => {
    event(JSON.stringify({ pull_request: { labels: ['skip-versions-guard'] } }));

    expect(skipRequested('skip-versions-guard')).toBe(true);
  });

  it('ignores an entry that carries no name', () => {
    event(JSON.stringify({ pull_request: { labels: [null, 42, { colour: 'red' }] } }));

    expect(skipRequested('skip-versions-guard')).toBe(false);
  });

  it('checks an event that is not a pull request', () => {
    event(JSON.stringify({ ref: 'refs/heads/main' }));

    expect(skipRequested('skip-versions-guard')).toBe(false);
  });

  it('checks a run that is not in Actions at all', () => {
    delete process.env['GITHUB_EVENT_PATH'];

    expect(skipRequested('skip-versions-guard')).toBe(false);
  });

  it('checks rather than throwing on an unreadable event file', () => {
    event('{ not json');

    expect(skipRequested('skip-versions-guard')).toBe(false);
  });
});
