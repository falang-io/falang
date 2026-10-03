import { describe, expect, it } from 'vitest';
import { pruneKeepAlive, touchKeepAlive } from './keep-alive.js';

describe('keep-alive LRU', () => {
  it('appends new ids and moves a re-activated one to the end', () => {
    expect(touchKeepAlive(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(touchKeepAlive(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
  });

  it('evicts the least recently active beyond the limit', () => {
    let list: string[] = [];
    for (const id of ['1', '2', '3', '4', '5', '6']) list = touchKeepAlive(list, id, 5);
    expect(list).toEqual(['2', '3', '4', '5', '6']);
    expect(touchKeepAlive(list, '2', 5)).toEqual(['3', '4', '5', '6', '2']);
  });

  it('never evicts the id just touched, even with max 1', () => {
    expect(touchKeepAlive(['a'], 'b', 1)).toEqual(['b']);
  });

  it('prunes closed tabs', () => {
    expect(pruneKeepAlive(['a', 'b', 'c'], (id) => id !== 'b')).toEqual(['a', 'c']);
  });
});
