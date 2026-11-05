/** One group of projects and what they owe. */
export interface ProjectGroup {
  /** Explicit directory paths. Patterns are refused by the guards. */
  path: string[];
  /** Files that carry the version. Every one of them must declare the same. */
  manifest: string[];
  /** Changelog to check, relative to a project. Absent asks for none. */
  changelog?: string;
  /** The command that sets this project's version, with `{version}` in it. */
  bump?: string;
}

/** What starts a release's publish workflow: pushing the tag, or dispatching the workflow. */
export type Trigger = 'tag' | 'dispatch';

/** How a release is cut, where the repository says. */
export interface Release {
  /** The branch a release is cut from. Absent means the default branch. */
  branch?: string;
  /** How the pull request lands: squash, rebase or merge. Absent means squash. */
  merge?: string;
  /** The workflow that must be green on the release commit before the release is published. */
  checks?: string;
  /** The workflow that publishes a release. Required where `trigger` includes dispatch. */
  publish?: string;
  /** What starts `publish`, in the order a release tool tries it. Absent means tag. */
  trigger?: Trigger[];
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
export const ABSENT: string;
export const IGNORED: string[];

export class ConfigError extends Error {}

export function parseYaml(text: string, where?: string): unknown;
export function settingsFrom(text: string, where?: string): Declared;
export function projectsFrom(value: unknown, where: string): ProjectGroup[];

/** Runs one git command in the repository: its exit status and stdout. */
export type RunGit = (args: string[]) => { status: number; stdout: string };

/** The previous release: its tag, its release commit, and the newer tags passed over. */
export interface PreviousRelease {
  tag: string | null;
  /** The tag's name where the branch holds the tag itself, otherwise the full SHA its trailer names. */
  commit: string | null;
  skipped: string[];
}

/** The full SHA a Source-Commit (or older Workflow-Commit) trailer names, or null. */
export function sourceCommitIn(message: string): string | null;
/** The commit a tag's release was cut from, where `head` contains it, or null. */
export function releaseCommitOf(git: RunGit, tag: string, head?: string): string | null;
/** The newest version tag whose release commit `head` contains; null with no version tag at all. */
export function newestReleaseTag(git: RunGit, head?: string): PreviousRelease | null;
