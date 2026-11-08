export interface WorkflowMetadata {
  serverUrl: string;
  repository: string;
  sha: string;
  runId: number;
}

/**
 * Appends links identifying the workflow revision and run that created the
 * target commit. A caller-provided body is kept first and visually separated
 * from the inferred footer. Workflow-Commit is left out when the body's
 * Source-Commit already names the same commit.
 */
export function appendWorkflowMetadata(body: string, metadata: WorkflowMetadata): string {
  const workflowCommit = `${metadata.serverUrl}/${metadata.repository}/commit/${metadata.sha}`;
  const customBody = body.trim();
  const namesWorkflowCommit = customBody
    .split('\n')
    .some((line) => line.trim() === `Source-Commit: <${workflowCommit}>`);
  const footer = [
    ...(namesWorkflowCommit ? [] : [`Workflow-Commit: <${workflowCommit}>`]),
    `Published-By: <${metadata.serverUrl}/${metadata.repository}/actions/runs/${metadata.runId}>`,
  ].join('\n');

  return customBody ? `${customBody}\n\n---\n\n${footer}` : footer;
}
