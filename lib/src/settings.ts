import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CONFIG_FILE,
  ConfigError,
  MISSPELLED,
  settingsFrom,
} from '../../packages/config/releasetools-config';
import type { ProjectGroup } from './config';
import type { ScanOptions } from './scan';
import { UsageError } from './usage-error';

export { CONFIG_FILE };

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
 * Reads `.releasetools.yaml` at the repository root.
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
      if (fs.existsSync(path.join(root, MISSPELLED))) {
        throw new UsageError(
          `${MISSPELLED} is not read. The file is ${CONFIG_FILE}; rename it, or the ` +
            'repository is judged as one project at its root with nothing declared.',
        );
      }
      return { except: [] };
    }
    throw new UsageError(`cannot read ${CONFIG_FILE}: ${message(err)}`);
  }

  if (text.trim() === '') {
    return { except: [] };
  }

  // One reader, shared with the release-notes plugin, so the two cannot
  // disagree about which project a change belongs to.
  let declared;
  try {
    declared = settingsFrom(text, CONFIG_FILE);
  } catch (err) {
    throw err instanceof ConfigError ? new UsageError(err.message) : err;
  }

  return {
    ...(declared.projects.length > 0 ? { projects: declared.projects as ProjectGroup[] } : {}),
    ...(declared.ignoreFiles === null ? {} : { ignoreFiles: declared.ignoreFiles }),
    ...(declared.caseSensitive ? { caseSensitive: true } : {}),
    except: declared.except,
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
