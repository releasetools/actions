import type { GitHub } from '@actions/github/lib/utils';
import type { Addition } from './enumerate-source';

type Octokit = InstanceType<typeof GitHub>;

export interface CommitInput {
  owner: string;
  repo: string;
  branch: string;
  expectedHeadOid: string;
  headline: string;
  body: string;
  additions: Addition[];
  deletions: Array<{ path: string }>;
}

interface CreateCommitOnBranchResponse {
  createCommitOnBranch: {
    commit: {
      oid: string;
      url: string;
    } | null;
  } | null;
}

const MUTATION = /* GraphQL */ `
  mutation CreateCommitOnBranch($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit {
        oid
        url
      }
    }
  }
`;

/**
 * Sends the createCommitOnBranch mutation. Returns the new commit's OID.
 *
 * The mutation fails if expectedHeadOid does not match the branch's actual
 * HEAD when the server evaluates the request. That race-protection is the
 * point of passing the OID at all. If something else pushes between our
 * fetch and the mutation, we want a loud failure, not a silent overwrite.
 */
export async function commit(octokit: Octokit, input: CommitInput): Promise<string> {
  const response = await octokit.graphql<CreateCommitOnBranchResponse>(MUTATION, {
    input: {
      branch: {
        repositoryNameWithOwner: `${input.owner}/${input.repo}`,
        branchName: input.branch,
      },
      message: {
        headline: input.headline,
        body: input.body,
      },
      expectedHeadOid: input.expectedHeadOid,
      fileChanges: {
        additions: input.additions,
        deletions: input.deletions,
      },
    },
  });

  const oid = response.createCommitOnBranch?.commit?.oid;
  if (!oid) {
    throw new Error(
      `createCommitOnBranch returned no commit oid. Full response: ${JSON.stringify(response)}`,
    );
  }
  return oid;
}
