import { describe, expect, it } from 'vitest';
import { appendWorkflowMetadata } from '../src/workflow-metadata';

const metadata = {
  serverUrl: 'https://github.com',
  repository: 'releasetools/actions',
  sha: 'abc1234',
  runId: 123456,
};

describe('appendWorkflowMetadata', () => {
  it('builds a complete body when the caller does not provide one', () => {
    expect(appendWorkflowMetadata('', metadata)).toBe(
      [
        'Workflow-Commit: <https://github.com/releasetools/actions/commit/abc1234>',
        'Published-By: <https://github.com/releasetools/actions/actions/runs/123456>',
      ].join('\n'),
    );
  });

  it('appends inferred metadata to a caller-provided body', () => {
    expect(
      appendWorkflowMetadata(
        'Changes: <https://github.com/releasetools/actions/compare/v0.0.4...v0.0.5>',
        metadata,
      ),
    ).toBe(
      [
        'Changes: <https://github.com/releasetools/actions/compare/v0.0.4...v0.0.5>',
        '',
        '---',
        '',
        'Workflow-Commit: <https://github.com/releasetools/actions/commit/abc1234>',
        'Published-By: <https://github.com/releasetools/actions/actions/runs/123456>',
      ].join('\n'),
    );
  });

  it('always appends inferred metadata after custom body content', () => {
    const body = [
      'Workflow-Commit: <https://example.test/custom-commit>',
      'Published-By: <https://example.test/custom-run>',
    ].join('\n');

    expect(appendWorkflowMetadata(body, metadata)).toBe(
      [
        body,
        '',
        '---',
        '',
        'Workflow-Commit: <https://github.com/releasetools/actions/commit/abc1234>',
        'Published-By: <https://github.com/releasetools/actions/actions/runs/123456>',
      ].join('\n'),
    );
  });
});
