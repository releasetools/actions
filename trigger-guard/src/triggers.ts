import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import type { Trigger } from '../../packages/config/releasetools-config';
import { CONFIG_FILE, readDeclared } from '../../lib/src/settings';

export interface Failure {
  message: string;
}

export interface Result {
  /** Why nothing was checked, where nothing was. */
  skipped?: string;
  /** One line per trigger the workflow accepts. */
  passed: string[];
  failures: Failure[];
}

/** Where GitHub reads workflows from, and so where `release.publish` names one. */
export const WORKFLOWS = '.github/workflows';

/**
 * The publish workflow `.releasetools.yaml` names accepts what its trigger
 * declares.
 *
 * A release tool acts on the declaration: it pushes a tag, or it dispatches
 * the workflow with a version and a commit. A workflow that does not start on
 * the one or take the other fails at release time, after the release commit
 * has merged, so the mismatch is cheaper to find on the pull request.
 */
export function guardTrigger(root: string): Result {
  const declared = readDeclared(root);
  if (declared === null) {
    return nothing(`No ${CONFIG_FILE}, so there is no publish workflow to check.`);
  }

  // The reader refuses dispatch without publish, so an absent publish means
  // the trigger is tag and the tag is the release.
  const { publish } = declared.release;
  if (publish === undefined) {
    return nothing(
      `${CONFIG_FILE} names no release.publish, so the tag is the release and there is no ` +
        'workflow to check.',
    );
  }

  const file = path.posix.join(WORKFLOWS, publish);
  let text: string;
  try {
    text = fs.readFileSync(path.join(root, file), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return failed(`${file} does not exist, and ${CONFIG_FILE} names it as release.publish.`);
    }
    throw err;
  }

  let workflow: unknown;
  try {
    workflow = parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return failed(`${file} is not YAML a workflow can be read from: ${reason}`);
  }
  return checkWorkflow(file, declared.release.trigger ?? ['tag'], workflow);
}

/** Checks one parsed workflow against the triggers a repository declares. */
export function checkWorkflow(
  file: string,
  triggers: readonly Trigger[],
  workflow: unknown,
): Result {
  const events = eventsOf(workflow);
  const passed: string[] = [];
  const failures: Failure[] = [];
  for (const trigger of triggers) {
    const problem = trigger === 'tag' ? tagProblem(file, events) : dispatchProblem(file, events);
    if (problem === null) {
      passed.push(
        trigger === 'tag'
          ? `${file} starts on a pushed tag, as release.trigger tag needs.`
          : `${file} takes the version and commit inputs, as release.trigger dispatch needs.`,
      );
    } else {
      failures.push({ message: problem });
    }
  }
  return { passed, failures };
}

/**
 * The events a workflow's `on` names, and each one's configuration.
 *
 * `on` is a string, a list of strings, or a mapping. Only the mapping can
 * configure an event, so the other two forms name events with nothing under
 * them.
 */
interface Events {
  names: string[];
  config: Record<string, unknown>;
}

function eventsOf(workflow: unknown): Events {
  const on = isMapping(workflow) ? workflow['on'] : undefined;
  if (typeof on === 'string') {
    return { names: [on], config: {} };
  }
  if (Array.isArray(on)) {
    return { names: on.filter((name): name is string => typeof name === 'string'), config: {} };
  }
  if (isMapping(on)) {
    return { names: Object.keys(on), config: on };
  }
  return { names: [], config: {} };
}

function tagProblem(file: string, events: Events): string | null {
  const needs = 'release.trigger includes tag, so on.push needs a tags filter';
  if (!events.names.includes('push')) {
    return `${file} does not start on push: ${needs}.`;
  }
  const push = events.config['push'];
  if (!isMapping(push)) {
    // A bare push starts on every branch push as well, and names no tag.
    return `${file} starts on every push, with no tags filter: ${needs}.`;
  }
  const tags = push['tags'];
  if (!(typeof tags === 'string' && tags !== '') && !(Array.isArray(tags) && tags.length > 0)) {
    return `${file} has no on.push.tags: ${needs}.`;
  }
  return null;
}

function dispatchProblem(file: string, events: Events): string | null {
  const needs =
    'release.trigger includes dispatch, so on.workflow_dispatch.inputs needs version and commit';
  if (!events.names.includes('workflow_dispatch')) {
    return `${file} does not start on workflow_dispatch: ${needs}.`;
  }
  const dispatch = events.config['workflow_dispatch'];
  const inputs = isMapping(dispatch) ? dispatch['inputs'] : undefined;
  if (!isMapping(inputs)) {
    return `${file} takes no workflow_dispatch inputs: ${needs}.`;
  }
  const missing = ['version', 'commit'].filter((name) => !(name in inputs));
  if (missing.length > 0) {
    return `${file} has no on.workflow_dispatch.inputs.${missing.join(' or ')}: ${needs}.`;
  }
  const commit = inputs['commit'];
  const fallback = isMapping(commit) ? commit['default'] : undefined;
  if (fallback !== undefined && fallback !== null && fallback !== 'HEAD') {
    return (
      `${file} defaults on.workflow_dispatch.inputs.commit to ${JSON.stringify(fallback)}: ` +
      'a commit nobody passed means HEAD, whatever the dispatched ref names when the run starts.'
    );
  }
  return null;
}

function nothing(skipped: string): Result {
  return { skipped, passed: [], failures: [] };
}

function failed(message: string): Result {
  return { passed: [], failures: [{ message }] };
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
