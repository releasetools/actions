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

  it('refuses a path, a manifest or a changelog that climbs out', () => {
    expect(() => parseProjects('- path: ../elsewhere')).toThrow(/path must be inside/);
    expect(() => parseProjects('- path: ./\n  manifest: ../../etc/passwd')).toThrow(
      /manifest must be inside/,
    );
    expect(() => parseProjects('- path: ./\n  changelog: a/../../b.md')).toThrow(
      /changelog must be inside/,
    );
  });

  it('refuses an absolute path', () => {
    expect(() => parseProjects('- path: /etc')).toThrow(/not an absolute path/);
    expect(() => parseProjects('- path: ./\n  manifest: /etc/passwd')).toThrow(
      /not an absolute path/,
    );
  });

  it('takes a .. that never leaves the name it is in', () => {
    expect(parseProjects('- path: ./\n  manifest: a..b.json')).toEqual([
      { path: ['./'], manifest: ['a..b.json'] },
    ]);
  });

  it('refuses the YAML tags that ask for code', () => {
    expect(() => parseProjects('- path: !!js/function "function () {}"')).toThrow(
      /not valid YAML/,
    );
  });

  it('says where YAML broke', () => {
    expect(() => parseProjects('- path: [unclosed')).toThrow(/is not valid YAML/);
  });
});
