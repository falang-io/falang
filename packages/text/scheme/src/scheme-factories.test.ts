import { describe, expect, it } from 'vitest';
import { functionalSchemeFactory } from './functional.js';
import { mindTreeSchemeFactory } from './mind-tree.js';

describe('scheme factories', () => {
  it('functionalSchemeFactory() still constructs after migrating to htmlBlockConfig', () => {
    const scheme = functionalSchemeFactory();
    expect(scheme).toBeTruthy();
    scheme.dispose();
  });

  it('mindTreeSchemeFactory() still constructs after migrating to htmlBlockConfig', () => {
    const scheme = mindTreeSchemeFactory();
    expect(scheme).toBeTruthy();
    scheme.dispose();
  });
});
