import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataDir } from './data-dir.js';

describe('resolveDataDir', () => {
  it('puts the local-mode data in <userData>/flow', () => {
    expect(resolveDataDir('/u')).toBe(path.join('/u', 'flow'));
  });
});
