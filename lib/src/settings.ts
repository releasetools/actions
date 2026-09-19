import * as fs from 'node:fs';
import * as path from 'node:path';
import { load } from 'js-yaml';
import { type ProjectGroup, projectsFrom } from './config';
import type { ScanOptions } from './scan';
import { UsageError } from './usage-error';

/** Where a repository says what it holds and which conventions it follows. */
export const CONFIG_FILE = '.releasetools.yml';

export interface Settings {
  /** Groups of projects. Absent leaves the repository itself as the project. */
  projects?: ProjectGroup[];
  /** Files whose edits do not count as a project changing. */
  ignoreFiles?: string[];
  /** Whether those patterns match case exactly. */
  caseSensitive?: boolean;
  /** Conventions this repository has declared it does not follow. */
  except: string[];
}

/** What a guard runs on: what the scan needs, and what the repository excepts. */
export interface GuardOptions extends ScanOptions {
  except?: readonly string[];
}

/**
 * Reads `.releasetools.yml` at the repository root.
 *
 * A guard is configured by the repository rather than by the workflow that
 * calls it, so the same declaration serves every tool that reads this file and
 * including the action is the whole of switching a guard on. A repository that
 * keeps no such file is one project at its root.
 */
export function readSettings(root: string): Settings {
  let text: string;
  try {
    text = fs.readFileSync(path.join(root, CONFIG_FILE), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { except: [] };
    }
    throw new UsageError(`cannot read ${CONFIG_FILE}: ${message(err)}`);
  }

  if (text.trim() === '') {
    return { except: [] };
  }

  let parsed: unknown;
  try {
    parsed = load(text);
  } catch (err) {
    throw new UsageError(`${CONFIG_FILE} is not valid YAML: ${message(err)}`);
  }

  if (parsed === null || parsed === undefined) {
    return { except: [] };
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UsageError(`${CONFIG_FILE} must be a mapping of keys, for example:\n  projects:\n    - path: ./`);
  }

  // Unrecognised keys belong to other tools reading the same file.
  const record = parsed as Record<string, unknown>;
  const projects = projectsFrom(record['projects'], `${CONFIG_FILE} projects`);
  const ignoreFiles = strings(record['ignore-files'], `${CONFIG_FILE} ignore-files`);

  return {
    ...(projects.length > 0 ? { projects } : {}),
    ...(record['ignore-files'] === undefined ? {} : { ignoreFiles }),
    ...(record['case-sensitive'] === undefined
      ? {}
      : { caseSensitive: boolean(record['case-sensitive'], `${CONFIG_FILE} case-sensitive`) }),
    except: exceptions(record['conventions']),
  };
}

/** The conventions the repository has opted out of, which no tool then checks. */
function exceptions(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageError(`${CONFIG_FILE} conventions must be a mapping with an except list`);
  }
  return strings((value as Record<string, unknown>)['except'], `${CONFIG_FILE} conventions except`);
}

function strings(value: unknown, where: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? [] : [value.trim()];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return (value as string[]).map((item) => item.trim()).filter((item) => item !== '');
  }
  throw new UsageError(`${where} must be one name or a list of them`);
}

function boolean(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') {
    throw new UsageError(`${where} must be true or false`);
  }
  return value;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
