import { describe, expect, it } from 'vitest';
import { sourceCommitOf } from '../src/source-commit';

const SHA = 'a'.repeat(40);
const SERVER = 'https://github.com';
const SOURCE = { owner: 'my-org', repo: 'mono' };
const TRAILER = `Source-Commit: <${SERVER}/my-org/mono/commit/${SHA}>`;

describe('sourceCommitOf', () => {
  it('reads the trailer above the signed-push footer', () => {
    const message = `publish: v1.2.3\n\n${TRAILER}\n\n---\n\nWorkflow-Commit: <${SERVER}/my-org/mono/commit/${'b'.repeat(40)}>\n`;
    expect(sourceCommitOf(message, SERVER, SOURCE)).toBe(SHA);
  });

  it('reads a repository named in another case', () => {
    expect(sourceCommitOf(`x\n\nSource-Commit: <${SERVER}/My-Org/Mono/commit/${SHA}>`, SERVER, SOURCE)).toBe(SHA);
  });

  it.each([
    ['no trailer', 'publish: v1.2.3\n', 'has 0'],
    ['two trailers', `x\n\n${TRAILER}\n${TRAILER}\n`, 'has 2'],
    ['a second trailer in another case', `x\n\n${TRAILER}\nsource-commit: <${SERVER}/my-org/mono/commit/${SHA}>\n`, 'has 2'],
  ])('refuses %s', (_, message, count) => {
    expect(() => sourceCommitOf(message, SERVER, SOURCE)).toThrow(`exactly one Source-Commit trailer, and ${count}`);
  });

  it.each([
    ['another repository', `Source-Commit: <${SERVER}/my-org/fork/commit/${SHA}>`],
    ['another server', `Source-Commit: <https://example.com/my-org/mono/commit/${SHA}>`],
    ['a short SHA', `Source-Commit: <${SERVER}/my-org/mono/commit/${SHA.slice(0, 12)}>`],
    ['a branch', `Source-Commit: <${SERVER}/my-org/mono/commit/main>`],
    ['an uppercase SHA', `Source-Commit: <${SERVER}/my-org/mono/commit/${SHA.toUpperCase()}>`],
    ['the owner@sha form', `Source-Commit: my-org/mono@${SHA}`],
    ['a lowercase key', `source-commit: <${SERVER}/my-org/mono/commit/${SHA}>`],
  ])('refuses %s', (_, trailer) => {
    expect(() => sourceCommitOf(`x\n\n${trailer}\n`, SERVER, SOURCE)).toThrow(
      `the trailer must read "Source-Commit: <${SERVER}/my-org/mono/commit/<full SHA>>"`,
    );
  });
});
