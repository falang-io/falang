import { describe, expect, it } from 'vitest';
import { NodesStack } from '@falang/dto';
import { getTextGroup } from './index.js';

describe('text group return', () => {
  const stack = new NodesStack([getTextGroup()]);

  it('carries no data, like break/continue', () => {
    expect(stack.factory('return').data).toBeUndefined();
    expect(stack.getConfig('return').data).toBeUndefined();
  });

  it('drops the text an older document stored on a return', () => {
    const parsed = stack.parseNode({ id: 'r1', name: 'return', data: 'result' });
    expect(parsed).not.toHaveProperty('data');
  });
});
