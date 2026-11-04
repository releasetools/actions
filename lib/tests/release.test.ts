import { describe, expect, it } from 'vitest';
import { settingsFrom } from '../../packages/config/releasetools-config';

function release(block: string) {
  return settingsFrom(`release:\n${block}`).release;
}

describe('release.trigger', () => {
  it('is left out where the file says nothing, which the format reads as tag', () => {
    expect(release('  branch: main')).toEqual({ branch: 'main' });
  });

  it('reads one trigger as a list of one', () => {
    expect(release('  trigger: tag')).toEqual({ trigger: ['tag'] });
    expect(release('  publish: release.yaml\n  trigger: dispatch')).toEqual({
      publish: 'release.yaml',
      trigger: ['dispatch'],
    });
  });

  it('keeps the order of a list, since the first is what a release tool does', () => {
    expect(release('  publish: release.yaml\n  trigger: [dispatch, tag]').trigger).toEqual([
      'dispatch',
      'tag',
    ]);
  });

  it('refuses a dispatch with no workflow to dispatch', () => {
    expect(() => release('  trigger: dispatch')).toThrow(/publish must name the workflow it dispatches/);
  });

  it('refuses anything but tag and dispatch, once each', () => {
    expect(() => release('  trigger: push')).toThrow(/must be tag, dispatch, or a list of both/);
    expect(() => release('  trigger: []')).toThrow(/must be tag, dispatch, or a list of both/);
    expect(() => release('  trigger: [tag, tag]')).toThrow(/names tag twice/);
  });
});
