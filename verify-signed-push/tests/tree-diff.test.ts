import { describe, expect, it } from 'vitest';
import { treeDifferences } from '../src/tree-diff';

describe('treeDifferences', () => {
  it('names missing, extra and changed files by path, skipping directories', () => {
    const source = [
      { path: 'bin', type: 'tree', mode: '040000', sha: 't1' },
      { path: 'bin/run', type: 'blob', mode: '100755', sha: 's1' },
      { path: 'README.md', type: 'blob', mode: '100644', sha: 's2' },
      { path: 'link', type: 'blob', mode: '120000', sha: 's3' },
    ];
    const mirror = [
      { path: 'bin', type: 'tree', mode: '040000', sha: 't2' },
      { path: 'bin/run', type: 'blob', mode: '100644', sha: 's1' },
      { path: 'README.md', type: 'blob', mode: '100644', sha: 's2' },
      { path: 'extra.txt', type: 'blob', mode: '100644', sha: 's4' },
    ];

    expect(treeDifferences(source, mirror)).toEqual([
      '~ bin/run is 100755 s1 in the source and 100644 s1 in the mirror',
      '+ extra.txt is not in the source',
      '- link is missing from the mirror',
    ]);
  });

  it('says nothing about identical listings', () => {
    const tree = [{ path: 'a', type: 'blob', mode: '100644', sha: 's' }];
    expect(treeDifferences(tree, tree)).toEqual([]);
  });
});
