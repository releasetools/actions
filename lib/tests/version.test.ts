import { describe, expect, it } from 'vitest';
import { versionFrom } from '../src/version';

describe('versionFrom', () => {
  it('reads package.json', () => {
    expect(versionFrom('package.json', '{"name":"web","version":"1.2.3"}')).toBe('1.2.3');
  });

  it('reads a manifest nested in a directory, by its name alone', () => {
    expect(versionFrom('.claude-plugin/plugin.json', '{"version":"0.4.2"}')).toBe('0.4.2');
  });

  it('says what is wrong with JSON that does not parse', () => {
    expect(() => versionFrom('package.json', '{ not json')).toThrow(/is not valid JSON/);
  });

  it('reads Cargo.toml from its package table', () => {
    const cargo = `[package]
name = "api"
version = "0.5.0"   # the one that counts

[dependencies]
serde = { version = "1.0.200" }
`;
    expect(versionFrom('Cargo.toml', cargo)).toBe('0.5.0');
  });

  it('does not take a version out of a dependency', () => {
    const cargo = `[dependencies]
serde = "1"
version = "9.9.9"
`;
    expect(() => versionFrom('Cargo.toml', cargo)).toThrow(/declares no version/);
  });

  it('reads pyproject.toml from its project table', () => {
    expect(versionFrom('pyproject.toml', '[project]\nname = "api"\nversion = "2.0.1"\n')).toBe(
      '2.0.1',
    );
  });

  it('reads pyproject.toml written for poetry', () => {
    expect(versionFrom('pyproject.toml', '[tool.poetry]\nversion = "3.1.4"\n')).toBe('3.1.4');
  });

  it('leaves an array of tables out of it', () => {
    const toml = `[[bin]]
name = "cli"
version = "9.9.9"

[package]
version = "0.1.0"
`;
    expect(versionFrom('Cargo.toml', toml)).toBe('0.1.0');
  });

  it('reads a top-level version out of YAML', () => {
    expect(versionFrom('Chart.yaml', 'name: api\nversion: 1.4.0\nappVersion: "9"\n')).toBe('1.4.0');
  });

  it('will not take an indented version out of YAML', () => {
    expect(() => versionFrom('Chart.yaml', 'dependencies:\n  version: 1.4.0\n')).toThrow(
      /declares no version/,
    );
  });

  it('reads gradle.properties', () => {
    expect(versionFrom('gradle.properties', 'group=com.example\nversion=1.0.0-SNAPSHOT\n')).toBe(
      '1.0.0-SNAPSHOT',
    );
  });

  it('reads a VERSION file', () => {
    expect(versionFrom('VERSION', '2.3.4\n')).toBe('2.3.4');
  });

  it('refuses a VERSION file holding more than a version', () => {
    expect(() => versionFrom('VERSION', '2.3.4\nand a note\n')).toThrow(/more than a version/);
  });

  it('refuses XML rather than guessing between a version and its parent’s', () => {
    expect(() => versionFrom('pom.xml', '<project><version>1.0</version></project>')).toThrow(
      /does not read/,
    );
  });

  it('strips the quotes and the comment from a declared value', () => {
    expect(versionFrom('Chart.yaml', "version: '1.2.3'  # released\n")).toBe('1.2.3');
  });
});
