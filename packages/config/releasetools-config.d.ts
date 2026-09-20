/** One group of projects and what they owe. */
export interface ProjectGroup {
  /** Explicit directory paths. Patterns are refused by the guards. */
  path: string[];
  /** Files that may declare the version. Every one a project holds must agree. */
  manifest?: string[];
  /** Changelog to check, relative to a project. Absent asks for none. */
  changelog?: string;
  /** The command that sets this project's version, with `{version}` in it. */
  bump?: string;
}

/** How a release is cut, where the repository says. */
export interface Release {
  /** The branch a release is cut from. Absent means the default branch. */
  branch?: string;
  /** The workflow that must be green on the merged commit before a tag. */
  checks?: string;
  /** The workflow a tag starts. */
  publish?: string;
  /** A URL that answers 404 for a version not yet released. */
  registry?: string;
}

/** What `.releasetools.yaml` declares, checked. */
export interface Declared {
  projects: ProjectGroup[];
  release: Release;
  /** Null where the file says nothing, which is not the same as an empty list. */
  ignoreFiles: string[] | null;
  caseSensitive: boolean;
  except: string[];
}

export const CONFIG_FILE: string;
export const MISSPELLED: string;
export const MANIFESTS: string[];
export const IGNORED: string[];

export class ConfigError extends Error {}

export function parseYaml(text: string, where?: string): unknown;
export function settingsFrom(text: string, where?: string): Declared;
export function projectsFrom(value: unknown, where: string): ProjectGroup[];
