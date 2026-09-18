import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { carriesLabel, pullRequestLabels } from '../src/skip-label';

describe('carriesLabel', () => {
  it('finds the label among the payload objects', () => {
    expect(carriesLabel([{ name: 'bug' }, { name: 'no-release' }], 'no-release')).toBe(true);
  });

  it('is false when the pull request carries other labels', () => {
    expect(carriesLabel([{ name: 'bug' }], 'no-release')).toBe(false);
  });

  it('is false when there is no pull request to read labels from', () => {
    expect(carriesLabel(undefined, 'no-release')).toBe(false);
  });

  it('never skips on an empty label, whatever the pull request carries', () => {
    expect(carriesLabel([{ name: '' }, { name: 'bug' }], '')).toBe(false);
  });

  it('accepts bare strings, since a hand-built payload is somebody else’s shape', () => {
    expect(carriesLabel(['no-release'], 'no-release')).toBe(true);
  });

  it('ignores an entry that carries no name', () => {
    expect(carriesLabel([null, 42, { colour: 'red' }], 'no-release')).toBe(false);
  });
});

describe('pullRequestLabels', () => {
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

  it('reads the labels out of the event file', () => {
    event(JSON.stringify({ pull_request: { labels: [{ name: 'no-release' }] } }));

    expect(pullRequestLabels()).toEqual([{ name: 'no-release' }]);
  });

  it('has nothing to report on an event that is not a pull request', () => {
    event(JSON.stringify({ ref: 'refs/heads/main' }));

    expect(pullRequestLabels()).toBeUndefined();
  });

  it('has nothing to report when the run is not in Actions', () => {
    delete process.env['GITHUB_EVENT_PATH'];

    expect(pullRequestLabels()).toBeUndefined();
  });

  it('runs the check rather than throwing on an unreadable event file', () => {
    event('{ not json');

    expect(pullRequestLabels()).toBeUndefined();
  });
});
