import { describe, expect, it } from 'vitest';
import { collectTags } from '../src/tags-input';

describe('collectTags', () => {
  it('returns each multiline tag in order', () => {
    expect(collectTags(['v1.2.3', 'v1'], '')).toEqual(['v1.2.3', 'v1']);
  });

  it('combines multiline and legacy singular inputs', () => {
    expect(collectTags(['v1.2.3', 'v1'], 'latest')).toEqual(['v1.2.3', 'v1', 'latest']);
  });

  it('trims, removes empty values, and deduplicates', () => {
    expect(collectTags([' v1.2.3 ', '', 'v1', 'v1.2.3'], ' v1 ')).toEqual([
      'v1.2.3',
      'v1',
    ]);
  });
});
