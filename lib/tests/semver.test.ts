import { describe, expect, it } from 'vitest';
import { compare, parse } from '../src/semver';

function order(left: string, right: string): number {
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) {
    throw new Error(`not a version: ${!a ? left : right}`);
  }
  return compare(a, b);
}

describe('parse', () => {
  it('takes a version, with or without the v a tag carries', () => {
    expect(parse('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(parse('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
  });

  it('takes a pre-release and its identifiers', () => {
    expect(parse('1.0.0-rc.1')?.prerelease).toEqual(['rc', '1']);
    expect(parse('1.0.0-alpha.beta')?.prerelease).toEqual(['alpha', 'beta']);
    expect(parse('1.0.0-SNAPSHOT')?.prerelease).toEqual(['SNAPSHOT']);
  });

  it('ignores build metadata, which is what the specification says to do', () => {
    expect(parse('1.2.3+build.5')).toEqual(parse('1.2.3'));
  });

  it('refuses what is not a version', () => {
    expect(parse('1.0')).toBeNull();
    expect(parse('v1.2')).toBeNull();
    expect(parse('2026.09.19')).toBeNull();
    expect(parse('1.2.3-')).toBeNull();
    expect(parse('')).toBeNull();
  });

  it('refuses a leading zero, which the specification forbids', () => {
    expect(parse('01.2.3')).toBeNull();
    expect(parse('1.0.0-rc.01')).toBeNull();
  });
});

describe('compare', () => {
  it('orders the specification’s own example', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
    ];
    for (let index = 1; index < ordered.length; index++) {
      expect(order(ordered[index - 1]!, ordered[index]!)).toBeLessThan(0);
      expect(order(ordered[index]!, ordered[index - 1]!)).toBeGreaterThan(0);
    }
  });

  it('puts a release above every pre-release of itself', () => {
    expect(order('0.2.0-rc1', '0.2.0')).toBeLessThan(0);
    expect(order('0.2.0', '0.2.0-rc1')).toBeGreaterThan(0);
  });

  it('puts a pre-release above the release it follows', () => {
    expect(order('0.1.0', '0.2.0-rc1')).toBeLessThan(0);
  });

  it('compares numeric identifiers numerically, not as text', () => {
    expect(order('1.0.0-beta.2', '1.0.0-beta.11')).toBeLessThan(0);
  });

  it('is zero for versions differing only in build metadata', () => {
    expect(order('1.2.3+one', '1.2.3+two')).toBe(0);
  });

  it('orders the core before anything else', () => {
    expect(order('1.2.3', '1.3.0')).toBeLessThan(0);
    expect(order('1.9.0', '2.0.0')).toBeLessThan(0);
    expect(order('1.2.10', '1.2.9')).toBeGreaterThan(0);
  });
});
