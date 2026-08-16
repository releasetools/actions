export interface WorkflowMetadata {
  serverUrl: string;
  repository: string;
  sha: string;
  runId: number;
}

/**
 * Appends links identifying the workflow revision and run that created the
 * target commit. A caller-provided body is kept first and visually separated
 * from the inferred footer.
 */
export function appendWorkflowMetadata(body: string, metadata: WorkflowMetadata): string {
  const footer = [
    `Workflow-Commit: <${metadata.serverUrl}/${metadata.repository}/commit/${metadata.sha}>`,
    `Published-By: <${metadata.serverUrl}/${metadata.repository}/actions/runs/${metadata.runId}>`,
  ].join('\n');
  const customBody = body.trim();

  return customBody ? `${customBody}\n\n---\n\n${footer}` : footer;
}
