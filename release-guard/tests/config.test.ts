import { describe, expect, it } from 'vitest';
import { parseProjects } from '../src/config';

describe('parseProjects', () => {
  it('reads a group of paths, manifests and a changelog', () => {
    expect(
      parseProjects(`
- path: packages/*
  manifest: package.json
  changelog: CHANGELOG.md
- path: crates/*
  manifest: Cargo.toml
`),
    ).toEqual([
      { path: ['packages/*'], manifest: ['package.json'], changelog: 'CHANGELOG.md' },
      { path: ['crates/*'], manifest: ['Cargo.toml'] },
    ]);
  });

  it('takes a list wherever it takes one name', () => {
    expect(
      parseProjects(`
- path:
    - packages/*
    - tools/build
  manifest:
    - package.json
    - VERSION
`),
    ).toEqual([
      { path: ['packages/*', 'tools/build'], manifest: ['package.json', 'VERSION'] },
    ]);
  });

  it('leaves an entry that names no manifest to the default', () => {
    expect(parseProjects('- path: ./')).toEqual([{ path: ['./'] }]);
  });

  it('reads an empty input as nothing said', () => {
    expect(parseProjects('')).toEqual([]);
    expect(parseProjects('\n  \n')).toEqual([]);
  });

  it('refuses YAML that is not a list of entries', () => {
    expect(() => parseProjects('packages/*')).toThrow(/must be a list of entries/);
    expect(() => parseProjects('path: packages/*')).toThrow(/must be a list of entries/);
  });

  it('refuses an entry with no path', () => {
    expect(() => parseProjects('- manifest: package.json')).toThrow(
      /projects entry 1 needs a path/,
    );
  });

  it('names the key it does not know, since a typo configures the wrong thing quietly', () => {
    expect(() => parseProjects('- paths: packages/*')).toThrow(/entry 1 has no paths/);
  });

  it('refuses a changelog that is not one name', () => {
    expect(() => parseProjects('- path: ./\n  changelog:\n    - a\n    - b')).toThrow(
      /changelog must be the name of one file/,
    );
  });

  it('says where YAML broke', () => {
    expect(() => parseProjects('- path: [unclosed')).toThrow(/is not valid YAML/);
  });
});
