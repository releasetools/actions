import { describe, expect, it, vi } from 'vitest';
import { verify, type VerifyInput } from '../src/verify';

const SOURCE = 'a'.repeat(40);
const MIRROR = 'b'.repeat(40);
const TREE = 'c'.repeat(40);
const TAG_OID = 'd'.repeat(40);
const OTHER = 'e'.repeat(40);
const SERVER = 'https://github.com';
const PUBLISHER = 'my-app[bot]';
const TRAILER = `Source-Commit: <${SERVER}/my-org/mono/commit/${SOURCE}>`;

function notFound(): Error {
  return Object.assign(new Error('Not Found'), { status: 404 });
}

/** GitHub's answers for a valid release published from my-org/mono:plugin to my-org/plugin. */
function github() {
  const state = {
    commit: {
      sha: MIRROR,
      author: { login: PUBLISHER } as { login: string } | null,
      committer: { login: 'web-flow' } as { login: string } | null,
      commit: {
        tree: { sha: TREE },
        message: `publish: v1.2.3\n\n${TRAILER}\n\n---\n\nWorkflow-Commit: <${SERVER}/my-org/mono/commit/${SOURCE}>\n`,
        verification: { verified: true, reason: 'valid' } as { verified: boolean; reason: string } | undefined,
      },
    },
    compare: { status: 'ahead', behind_by: 0, merge_base_commit: { sha: SOURCE } },
    ref: { ref: 'refs/tags/v1.2.3', object: { type: 'tag', sha: TAG_OID } } as unknown,
    tag: {
      sha: TAG_OID,
      tag: 'v1.2.3',
      object: { type: 'commit', sha: SOURCE },
      verification: { verified: true, reason: 'valid' },
    },
    sourceTree: TREE,
    listings: {} as Record<string, { tree: unknown[]; truncated: boolean }>,
  };
  const repos = {
    getCommit: vi.fn(async (_args: unknown) => ({ data: state.commit })),
    get: vi.fn(async (_args: unknown) => ({ data: { default_branch: 'main' } })),
    compareCommitsWithBasehead: vi.fn(async (_args: unknown) => ({ data: state.compare })),
  };
  const git = {
    getRef: vi.fn(async (_args: unknown) => {
      if (state.ref === null) {
        throw notFound();
      }
      return { data: state.ref };
    }),
    getTag: vi.fn(async (_args: unknown) => ({ data: state.tag })),
    getTree: vi.fn(async (args: { tree_sha: string; recursive?: string }) => {
      if (args.recursive) {
        return { data: state.listings[args.tree_sha] ?? { tree: [], truncated: false } };
      }
      return { data: { sha: state.sourceTree } };
    }),
  };
  return { state, repos, git, octokit: { rest: { repos, git } } as never };
}

function input(overrides: Partial<VerifyInput> = {}): VerifyInput {
  return {
    repository: { owner: 'my-org', repo: 'plugin' },
    commit: MIRROR,
    source: { owner: 'my-org', repo: 'mono' },
    sourcePath: 'plugin',
    publisher: PUBLISHER,
    sourceCommit: '',
    tag: '',
    serverUrl: SERVER,
    ...overrides,
  };
}

const quiet = () => undefined;

describe('verify', () => {
  it('accepts a release published by the App from the default branch', async () => {
    const { octokit, git, repos } = github();

    const verified = await verify(octokit, input({ sourceCommit: SOURCE, tag: 'v1.2.3' }), quiet);

    expect(verified).toEqual({ commitSha: MIRROR, sourceCommit: SOURCE });
    expect(repos.getCommit).toHaveBeenCalledWith({ owner: 'my-org', repo: 'plugin', ref: MIRROR, per_page: 1 });
    expect(repos.compareCommitsWithBasehead).toHaveBeenCalledWith({
      owner: 'my-org',
      repo: 'mono',
      basehead: `${SOURCE}...main`,
      per_page: 1,
    });
    expect(git.getTag).toHaveBeenCalledWith({ owner: 'my-org', repo: 'mono', tag_sha: TAG_OID });
    expect(git.getTree).toHaveBeenCalledWith({ owner: 'my-org', repo: 'mono', tree_sha: `${SOURCE}:plugin` });
  });

  it('accepts a branch name for the published commit and answers with its SHA', async () => {
    const { octokit } = github();

    await expect(verify(octokit, input({ commit: 'main' }), quiet)).resolves.toEqual({
      commitSha: MIRROR,
      sourceCommit: SOURCE,
    });
  });

  it('accepts a source branch that moved on after publication', async () => {
    const { octokit, state } = github();
    state.compare = { status: 'identical', behind_by: 0, merge_base_commit: { sha: SOURCE } };
    await expect(verify(octokit, input(), quiet)).resolves.toBeDefined();
  });

  it('checks no tag unless asked', async () => {
    const { octokit, git } = github();
    await verify(octokit, input(), quiet);
    expect(git.getRef).not.toHaveBeenCalled();
  });

  describe('the published commit', () => {
    it('refuses an answer for another commit', async () => {
      const { octokit, state } = github();
      state.commit.sha = OTHER;
      await expect(verify(octokit, input(), quiet)).rejects.toThrow(`answered ${MIRROR} in my-org/plugin with ${OTHER}`);
    });

    it('refuses an unsigned commit', async () => {
      const { octokit, state } = github();
      state.commit.commit.verification = { verified: false, reason: 'unsigned' };
      await expect(verify(octokit, input(), quiet)).rejects.toThrow('carries no verified signature (unsigned)');
    });

    it('refuses a web-flow committer on an unverified signature', async () => {
      const { octokit, state } = github();
      state.commit.commit.verification = { verified: false, reason: 'bad_email' };
      await expect(verify(octokit, input(), quiet)).rejects.toThrow('carries no verified signature (bad_email)');
    });

    it('refuses a verified signature that GitHub did not make', async () => {
      const { octokit, state } = github();
      state.commit.committer = { login: 'mallory' };
      await expect(verify(octokit, input(), quiet)).rejects.toThrow('was not signed by GitHub: its committer is mallory');
    });

    it('refuses the App as author when another key signed the commit', async () => {
      const { octokit, state } = github();
      state.commit.committer = null;
      await expect(verify(octokit, input(), quiet)).rejects.toThrow('its committer is no GitHub account');
    });

    it('refuses a commit GitHub signed for someone else, such as a web edit', async () => {
      const { octokit, state } = github();
      state.commit.author = { login: 'alice' };
      await expect(verify(octokit, input(), quiet)).rejects.toThrow(`was authored by alice, not ${PUBLISHER}`);
    });
  });

  describe('the source commit', () => {
    it('refuses a source-commit input that is not a full SHA', async () => {
      const { octokit, repos } = github();
      await expect(verify(octokit, input({ sourceCommit: 'main' }), quiet)).rejects.toThrow(
        'source-commit must be a full lowercase SHA, got "main"',
      );
      expect(repos.getCommit).not.toHaveBeenCalled();
    });

    it('never lets the source-commit input stand in for the trailer', async () => {
      const { octokit } = github();
      await expect(verify(octokit, input({ sourceCommit: OTHER }), quiet)).rejects.toThrow(
        `source-commit is ${OTHER}, but the Source-Commit trailer names ${SOURCE}`,
      );
    });

    it('refuses a source commit off the default branch', async () => {
      const { octokit, state, git } = github();
      state.compare = { status: 'diverged', behind_by: 2, merge_base_commit: { sha: OTHER } };
      await expect(verify(octokit, input(), quiet)).rejects.toThrow(`${SOURCE} is not on my-org/mono main`);
      expect(git.getTree).not.toHaveBeenCalled();
    });

    it('refuses a merge base other than the source commit', async () => {
      const { octokit, state } = github();
      state.compare = { status: 'ahead', behind_by: 0, merge_base_commit: { sha: OTHER } };
      await expect(verify(octokit, input(), quiet)).rejects.toThrow('is not on my-org/mono main');
    });

    it('refuses a source commit the source does not have', async () => {
      const { octokit, repos } = github();
      repos.compareCommitsWithBasehead.mockRejectedValueOnce(notFound());
      await expect(verify(octokit, input(), quiet)).rejects.toThrow(`${SOURCE} is not a commit in my-org/mono`);
    });
  });

  describe('the release tag', () => {
    it('refuses a missing tag', async () => {
      const { octokit, state } = github();
      state.ref = null;
      await expect(verify(octokit, input({ tag: 'v1.2.3' }), quiet)).rejects.toThrow('my-org/mono has no tag v1.2.3');
    });

    it('refuses a lightweight tag', async () => {
      const { octokit, state } = github();
      state.ref = { ref: 'refs/tags/v1.2.3', object: { type: 'commit', sha: SOURCE } };
      await expect(verify(octokit, input({ tag: 'v1.2.3' }), quiet)).rejects.toThrow('is not an annotated tag');
    });

    it('refuses an answer for another tag object', async () => {
      const { octokit, state } = github();
      state.tag.sha = OTHER;
      await expect(verify(octokit, input({ tag: 'v1.2.3' }), quiet)).rejects.toThrow(
        `answered tag object ${TAG_OID} with ${OTHER}`,
      );
    });

    it('refuses a tag that names another commit', async () => {
      const { octokit, state } = github();
      state.tag.object.sha = OTHER;
      await expect(verify(octokit, input({ tag: 'v1.2.3' }), quiet)).rejects.toThrow(`names ${OTHER}, not ${SOURCE}`);
    });

    it('refuses a tag with no verified signature', async () => {
      const { octokit, state } = github();
      state.tag.verification = { verified: false, reason: 'unsigned' };
      await expect(verify(octokit, input({ tag: 'v1.2.3' }), quiet)).rejects.toThrow(
        'v1.2.3 in my-org/mono carries no verified signature (unsigned)',
      );
    });
  });

  describe('the tree', () => {
    it('lists what differs and refuses', async () => {
      const { octokit, state } = github();
      state.sourceTree = OTHER;
      state.listings[OTHER] = {
        tree: [{ path: 'conf.d', type: 'tree', mode: '040000', sha: '1' }, { path: 'conf.d/a.fish', type: 'blob', mode: '100644', sha: '2' }],
        truncated: false,
      };
      state.listings[TREE] = {
        tree: [
          { path: 'conf.d/a.fish', type: 'blob', mode: '100644', sha: '2' },
          { path: 'retracted.txt', type: 'blob', mode: '100644', sha: '3' },
        ],
        truncated: true,
      };
      const lines: string[] = [];

      await expect(verify(octokit, input(), (line) => lines.push(line))).rejects.toThrow(
        `my-org/plugin@${MIRROR} does not hold my-org/mono@${SOURCE}:plugin: its tree is ${TREE}, and the source's is ${OTHER}`,
      );
      expect(lines).toEqual([
        '+ retracted.txt is not in the source',
        'GitHub truncated a tree listing, so the paths above are not all of them.',
      ]);
    });

    it('refuses a source path that is not a directory there', async () => {
      const { octokit, git } = github();
      git.getTree.mockRejectedValueOnce(notFound());
      await expect(verify(octokit, input(), quiet)).rejects.toThrow(`my-org/mono@${SOURCE}:plugin is not a directory`);
    });

    it.each([
      ['./plugin/', 'plugin'],
      ['packages/apt', 'packages/apt'],
      ['.', ''],
      ['./', ''],
    ])('looks up source-path "%s" as "%s"', async (sourcePath, path) => {
      const { octokit, git } = github();
      await verify(octokit, input({ sourcePath }), quiet);
      expect(git.getTree).toHaveBeenCalledWith({ owner: 'my-org', repo: 'mono', tree_sha: `${SOURCE}:${path}` });
    });

    it.each(['../plugin', '/plugin', 'plugin//conf.d', 'plugin/./conf.d'])('refuses source-path "%s"', async (sourcePath) => {
      const { octokit } = github();
      await expect(verify(octokit, input({ sourcePath }), quiet)).rejects.toThrow(
        'source-path must be a directory inside the source repository',
      );
    });
  });
});
