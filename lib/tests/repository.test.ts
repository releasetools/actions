import { describe, expect, it } from 'vitest';
import { parseRepository } from '../src/repository';

describe('parseRepository', () => {
  it('splits owner and repo', () => {
    expect(parseRepository('target-repo', 'releasetools/actions')).toEqual({ owner: 'releasetools', repo: 'actions' });
  });

  it.each(['actions', '/actions', 'releasetools/', 'releasetools/actions/extra', ''])('refuses "%s"', (value) => {
    expect(() => parseRepository('target-repo', value)).toThrow(`target-repo must be "owner/repo", got "${value}"`);
  });
});
