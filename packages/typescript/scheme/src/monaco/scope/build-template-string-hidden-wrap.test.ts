import { describe, expect, it } from 'vitest';
import { buildTemplateStringHiddenWrap } from './build-template-string-hidden-wrap.js';

describe('buildTemplateStringHiddenWrap', () => {
  it('wraps the scope code with a hidden opening/closing backtick', () => {
    const { hiddenPrefix, hiddenSuffix } = buildTemplateStringHiddenWrap('declare var i: number;\n');

    expect(hiddenPrefix).toBe('declare var i: number;\n`\n');
    expect(hiddenSuffix).toBe('\n`;');
  });

  it('produces text that assembles into a well-formed template literal once the value is inserted', () => {
    const { hiddenPrefix, hiddenSuffix } = buildTemplateStringHiddenWrap('declare var i: number;\n');
    // interpolation syntax, split so oxlint's no-template-curly-in-string rule doesn't misfire on this plain string
    const value = `index = $${'{i}'}`;

    expect(hiddenPrefix + value + hiddenSuffix).toBe(`declare var i: number;\n\`\n${value}\n\`;`);
  });
});
