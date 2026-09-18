import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SKIP_LABEL, carriesLabel, skipRequested } from '../src/skip-label';

describe('carriesLabel', () => {
  it('finds the label among the payload objects', () => {
    expect(carriesLabel([{ name: 'bug' }, { name: SKIP_LABEL }])).toBe(true);
  });

  it('is false when the pull request carries other labels', () => {
    expect(carriesLabel([{ name: 'bug' }])).toBe(false);
  });

  it('is false when there is no pull request to read labels from', () => {
    expect(carriesLabel(undefined)).toBe(false);
  });

  it('accepts bare strings, since a hand-built payload is somebody else’s shape', () => {
    expect(carriesLabel([SKIP_LABEL])).toBe(true);
  });

  it('ignores an entry that carries no name', () => {
    expect(carriesLabel([null, 42, { colour: 'red' }])).toBe(false);
  });
});

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
    event(JSON.stringify({ pull_request: { labels: [{ name: SKIP_LABEL }] } }));

    expect(skipRequested()).toBe(true);
  });

  it('checks a pull request carrying other labels', () => {
    event(JSON.stringify({ pull_request: { labels: [{ name: 'bug' }] } }));

    expect(skipRequested()).toBe(false);
  });

  it('checks an event that is not a pull request', () => {
    event(JSON.stringify({ ref: 'refs/heads/main' }));

    expect(skipRequested()).toBe(false);
  });

  it('checks a run that is not in Actions at all', () => {
    delete process.env['GITHUB_EVENT_PATH'];

    expect(skipRequested()).toBe(false);
  });

  it('checks rather than throwing on an unreadable event file', () => {
    event('{ not json');

    expect(skipRequested()).toBe(false);
  });
});
