import { describe, expect, it } from 'vitest';
import { section } from './changelog-section.mjs';

const CHANGELOG = `# Changelog

A preamble nobody releases.

## 0.2.0 - 2026-09-19

### Added

The newest one.

## [0.1.1]

The bracketed one.

## v0.1.0

The oldest one.
`;

describe('section', () => {
  it('takes the lines under a heading, up to the next one', () => {
    expect(section(CHANGELOG, '0.2.0')).toBe('### Added\n\nThe newest one.');
  });

  it('takes the brackets Keep a Changelog puts round a version', () => {
    expect(section(CHANGELOG, '0.1.1')).toBe('The bracketed one.');
  });

  it('takes a heading that kept its v', () => {
    expect(section(CHANGELOG, '0.1.0')).toBe('The oldest one.');
  });

  it('runs to the end of the file for the oldest release', () => {
    expect(section(CHANGELOG, '0.1.0')).not.toContain('#');
  });

  it('is empty for a version the changelog does not carry', () => {
    expect(section(CHANGELOG, '9.9.9')).toBe('');
  });

  it('does not read 0.1.0 out of 0.1.0-rc1', () => {
    expect(section('## 0.1.0-rc1\n\nNot the release.\n', '0.1.0')).toBe('');
  });

  it('never returns the preamble', () => {
    expect(section(CHANGELOG, '0.2.0')).not.toContain('A preamble');
  });
});
