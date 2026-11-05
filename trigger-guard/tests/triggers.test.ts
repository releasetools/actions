import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FILE } from '../../lib/src/settings';
import { checkWorkflow, guardTrigger } from '../src/triggers';

const FILE = '.github/workflows/publish.yml';

/** Checks a workflow written as YAML, parsed the way the action parses it. */
function check(workflow: string, triggers: Array<'tag' | 'dispatch'>) {
  return checkWorkflow(FILE, triggers, parse(workflow));
}

function failures(workflow: string, triggers: Array<'tag' | 'dispatch'>): string[] {
  return check(workflow, triggers).failures.map((failure) => failure.message);
}

const TAG_NEEDS = 'release.trigger includes tag, so on.push needs a tags filter.';
const DISPATCH_NEEDS =
  'release.trigger includes dispatch, so on.workflow_dispatch.inputs needs version and commit.';
const TAG_PASSED = `${FILE} starts on a pushed tag, as release.trigger tag needs.`;
const DISPATCH_PASSED =
  `${FILE} takes the version and commit inputs, as release.trigger dispatch needs.`;

const DISPATCH = `
on:
  workflow_dispatch:
    inputs:
      version:
        required: true
      commit:
        default: HEAD
`;

const TAG = `
on:
  push:
    tags: ['v*']
`;

describe('checkWorkflow', () => {
  it('reads on as the key it is', () => {
    // YAML 1.1 reads a bare on as true, and every workflow would name no events.
    expect(Object.keys(parse(TAG) as object)).toEqual(['on']);
  });

  it('passes a pushed tag under tag', () => {
    expect(check(TAG, ['tag'])).toEqual({
      passed: [TAG_PASSED],
      failures: [],
    });
    expect(failures("on:\n  push:\n    tags: 'v*'\n", ['tag'])).toEqual([]);
  });

  it('fails tag when on names no push', () => {
    for (const workflow of [DISPATCH, 'name: publish\n']) {
      expect(failures(workflow, ['tag'])).toEqual([`${FILE} does not start on push: ${TAG_NEEDS}`]);
    }
  });

  it('fails tag on a push with no tags filter, whatever shape on takes', () => {
    // A bare push starts on branch pushes too.
    for (const workflow of ['on: push\n', 'on: [push, workflow_dispatch]\n', 'on:\n  push:\n']) {
      expect(failures(workflow, ['tag'])).toEqual([
        `${FILE} starts on every push, with no tags filter: ${TAG_NEEDS}`,
      ]);
    }
    for (const workflow of [
      'on:\n  push:\n    branches: [main]\n',
      'on:\n  push:\n    tags: []\n',
    ]) {
      expect(failures(workflow, ['tag'])).toEqual([
        `${FILE} has no on.push.tags: ${TAG_NEEDS}`,
      ]);
    }
  });

  it('passes the version and commit inputs under dispatch', () => {
    expect(check(DISPATCH, ['dispatch'])).toEqual({
      passed: [DISPATCH_PASSED],
      failures: [],
    });
    // A commit with no default is HEAD by what the format says it means.
    const bare = 'on:\n  workflow_dispatch:\n    inputs:\n      version: {}\n      commit: {}\n';
    expect(failures(bare, ['dispatch'])).toEqual([]);
  });

  it('fails dispatch when on names no workflow_dispatch', () => {
    expect(failures(TAG, ['dispatch'])).toEqual([
      `${FILE} does not start on workflow_dispatch: ${DISPATCH_NEEDS}`,
    ]);
  });

  it('fails dispatch with no inputs, whatever shape on takes', () => {
    // Only a mapping can declare inputs.
    for (const workflow of [
      'on: workflow_dispatch\n',
      'on: [push, workflow_dispatch]\n',
      'on:\n  workflow_dispatch:\n',
      'on:\n  workflow_dispatch:\n    inputs:\n',
    ]) {
      expect(failures(workflow, ['dispatch'])).toEqual([
        `${FILE} takes no workflow_dispatch inputs: ${DISPATCH_NEEDS}`,
      ]);
    }
  });

  it('names each input the dispatch is missing', () => {
    const only = (input: string) => `on:\n  workflow_dispatch:\n    inputs:\n      ${input}: {}\n`;
    expect(failures(only('version'), ['dispatch'])).toEqual([
      `${FILE} has no on.workflow_dispatch.inputs.commit: ${DISPATCH_NEEDS}`,
    ]);
    expect(failures(only('commit'), ['dispatch'])).toEqual([
      `${FILE} has no on.workflow_dispatch.inputs.version: ${DISPATCH_NEEDS}`,
    ]);
    expect(failures(only('tag'), ['dispatch'])).toEqual([
      `${FILE} has no on.workflow_dispatch.inputs.version or commit: ${DISPATCH_NEEDS}`,
    ]);
  });

  it('fails a commit that defaults to anything but HEAD', () => {
    expect(failures(DISPATCH.replace('default: HEAD', 'default: main'), ['dispatch'])).toEqual([
      `${FILE} defaults on.workflow_dispatch.inputs.commit to "main": ` +
        'a commit nobody passed means HEAD, whatever the dispatched ref names when the run starts.',
    ]);
  });

  it('checks every trigger a list declares', () => {
    const both = `
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      version: {}
      commit:
        default: HEAD
`;
    expect(check(both, ['dispatch', 'tag']).failures).toEqual([]);
    expect(check(both, ['dispatch', 'tag']).passed).toHaveLength(2);
    expect(failures(DISPATCH, ['dispatch', 'tag'])).toHaveLength(1);
    expect(failures(TAG, ['dispatch', 'tag'])).toHaveLength(1);
  });
});

/**
 * The checks above take a parsed workflow. These write the repository's
 * declaration and its workflow to disk, so the file names, the missing file
 * and the reader's own refusals are the ones a run meets.
 */
describe('guardTrigger, against a real directory', () => {
  const roots: string[] = [];

  function repository(files: Record<string, string>): string {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-')));
    roots.push(root);
    for (const [relative, contents] of Object.entries(files)) {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes a dispatched workflow that takes both inputs', () => {
    const root = repository({
      [CONFIG_FILE]: 'release:\n  publish: publish.yml\n  trigger: dispatch\n',
      [FILE]: DISPATCH,
    });
    expect(guardTrigger(root)).toEqual({
      passed: [DISPATCH_PASSED],
      failures: [],
    });
  });

  it('reads an absent trigger as tag', () => {
    const root = repository({
      [CONFIG_FILE]: 'release:\n  publish: publish.yml\n',
      [FILE]: DISPATCH,
    });
    expect(guardTrigger(root).failures).toEqual([
      { message: `${FILE} does not start on push: ${TAG_NEEDS}` },
    ]);
  });

  it('skips a repository with no declaration, or no publish under tag', () => {
    expect(guardTrigger(repository({})).skipped).toMatch(/No \.releasetools\.yaml/);
    const tagOnly = repository({ [CONFIG_FILE]: 'release:\n  trigger: tag\n' });
    expect(guardTrigger(tagOnly).skipped).toMatch(/names no release\.publish/);
  });

  it('surfaces the reader refusing dispatch with no publish', () => {
    const root = repository({ [CONFIG_FILE]: 'release:\n  trigger: dispatch\n' });
    expect(() => guardTrigger(root)).toThrow(
      /trigger includes dispatch, so .* publish must name the workflow/,
    );
  });

  it('fails a publish workflow that is not there', () => {
    const root = repository({
      [CONFIG_FILE]: 'release:\n  publish: publish.yml\n  trigger: dispatch\n',
    });
    expect(guardTrigger(root).failures).toEqual([
      { message: `${FILE} does not exist, and ${CONFIG_FILE} names it as release.publish.` },
    ]);
  });

  it('fails a publish workflow that is not YAML', () => {
    const root = repository({
      [CONFIG_FILE]: 'release:\n  publish: publish.yml\n',
      [FILE]: 'on: [push\n',
    });
    expect(guardTrigger(root).failures[0]?.message).toContain(
      `${FILE} is not YAML a workflow can be read from`,
    );
  });
});
