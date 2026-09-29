import { describe, expect, it } from 'vitest';
import {
  getContainerScopeContribution,
  getScopeContribution,
  registerContainerScopeContributor,
  registerScopeContributor,
} from './node-scope-contribution.js';

describe('getScopeContribution', () => {
  it('returns undefined for a node with no data', () => {
    expect(getScopeContribution({ name: 'create-var' })).toBeUndefined();
    expect(getScopeContribution({ name: 'create-var', data: null })).toBeUndefined();
  });

  it('returns undefined for a node kind that does not introduce a variable', () => {
    expect(getScopeContribution({ name: 'action', data: 'x + 1' })).toBeUndefined();
  });

  it('resolves create-var to its declared name/type', () => {
    const contribution = getScopeContribution({
      name: 'create-var',
      data: { name: 'x', variableType: { type: 'number', numberType: { type: 'any' } } },
    });
    expect(contribution).toEqual({ name: 'x', type: { type: 'number', numberType: { type: 'any' } } });
  });

  it('resolves arr-pop/arr-shift to a raw element-type constant', () => {
    expect(getScopeContribution({ name: 'arr-pop', data: { arr: 'numbers', variable: 'popped' } })).toEqual({
      name: 'popped',
      type: { type: 'raw', expression: 'typeof numbers[number]', constant: true },
    });
    expect(getScopeContribution({ name: 'arr-shift', data: { arr: 'items[i].values', variable: 'shifted' } })).toEqual({
      name: 'shifted',
      type: { type: 'raw', expression: "typeof items[number]['values'][number]", constant: true },
    });
  });

  it('resolves arr-slice to a raw array-type constant', () => {
    expect(
      getScopeContribution({ name: 'arr-slice', data: { arr: 'numbers', variable: 'sliced', start: '0', end: '1' } }),
    ).toEqual({
      name: 'sliced',
      type: { type: 'raw', expression: 'typeof numbers', constant: true },
    });
  });

  describe('registerScopeContributor', () => {
    it('makes a dynamically registered contributor visible to getScopeContribution', () => {
      registerScopeContributor('call-ai-text', (data) => {
        const { resultVariable } = data as { resultVariable: string };
        if (!resultVariable) return;
        return { name: resultVariable, type: { type: 'string', constant: true } };
      });

      expect(
        getScopeContribution({
          name: 'call-ai-text',
          data: { resultVariable: 'aiReply' },
        }),
      ).toEqual({ name: 'aiReply', type: { type: 'string', constant: true } });
    });

    it('re-registering the same node name overwrites the previous contributor rather than stacking', () => {
      registerScopeContributor('some-action', () => ({ name: 'first', type: { type: 'string' } }));
      registerScopeContributor('some-action', () => ({
        name: 'second',
        type: { type: 'number', numberType: { type: 'any' } },
      }));

      expect(getScopeContribution({ name: 'some-action', data: {} })).toEqual({
        name: 'second',
        type: { type: 'number', numberType: { type: 'any' } },
      });
    });

    it('does not shadow a statically known node kind registered under the same name', () => {
      // `create-var` is a built-in `SCOPE_CONTRIBUTORS` entry — a dynamic registration under the same
      // name would never happen in practice, but the static registry must still win if it did.
      registerScopeContributor('create-var', () => ({ name: 'shadowed', type: { type: 'string' } }));

      expect(
        getScopeContribution({
          name: 'create-var',
          data: { name: 'x', variableType: { type: 'number', numberType: { type: 'any' } } },
        }),
      ).toEqual({ name: 'x', type: { type: 'number', numberType: { type: 'any' } } });
    });
  });
});

describe('getContainerScopeContribution', () => {
  it('returns [] for a node with no data or an unrecognized kind', () => {
    expect(getContainerScopeContribution({ name: 'function-body' })).toEqual([]);
    expect(getContainerScopeContribution({ name: 'while', data: 'x > 0' })).toEqual([]);
  });

  it('resolves function-body to its parameters, marked constant', () => {
    const contribution = getContainerScopeContribution({
      name: 'function-body',
      data: { name: 'fn', parameters: [{ name: 'a', type: { type: 'string' } }] },
    });
    expect(contribution).toEqual([{ name: 'a', type: { type: 'string', constant: true } }]);
  });

  it('resolves function-body to also include a mutable returnValue when the function is non-void', () => {
    const contribution = getContainerScopeContribution({
      name: 'function-body',
      data: { name: 'fn', parameters: [], returnValue: { type: 'number', numberType: { type: 'any' } } },
    });
    expect(contribution).toEqual([
      { name: 'returnValue', type: { type: 'number', numberType: { type: 'any' }, constant: false } },
    ]);
  });

  it('omits returnValue from function-body when the function is void or has no declared returnValue', () => {
    expect(getContainerScopeContribution({ name: 'function-body', data: { name: 'fn', parameters: [] } })).toEqual([]);
    expect(
      getContainerScopeContribution({
        name: 'function-body',
        data: { name: 'fn', parameters: [], returnValue: { type: 'void' } },
      }),
    ).toEqual([]);
  });

  it('resolves foreach to a raw element-type item, omitting index when unused', () => {
    expect(getContainerScopeContribution({ name: 'foreach', data: { arr: 'numbers', item: 'n', index: '' } })).toEqual([
      { name: 'n', type: { type: 'raw', expression: 'typeof numbers[number]', constant: true } },
    ]);
  });

  it('resolves foreach to item + index when index is used', () => {
    expect(getContainerScopeContribution({ name: 'foreach', data: { arr: 'numbers', item: 'n', index: 'i' } })).toEqual(
      [
        { name: 'n', type: { type: 'raw', expression: 'typeof numbers[number]', constant: true } },
        { name: 'i', type: { type: 'number', numberType: { type: 'any' }, constant: true } },
      ],
    );
  });

  it('resolves from-to-cycle to a mutable number item', () => {
    expect(getContainerScopeContribution({ name: 'from-to-cycle', data: { from: '0', to: '10', item: 'i' } })).toEqual([
      { name: 'i', type: { type: 'number', numberType: { type: 'any' }, constant: false } },
    ]);
  });

  it('resolves trigger-function-body to its bound trigger payload, marked constant', () => {
    const contribution = getContainerScopeContribution({
      name: 'trigger-function-body',
      data: {
        vendor: 'telegram',
        triggerName: 'telegram-trigger',
        credentialId: 'cred-1',
        scopeVariableName: 'message',
        scopeType: { type: 'struct', id: 'telegram/Message' },
      },
    });
    expect(contribution).toEqual([
      { name: 'message', type: { type: 'struct', id: 'telegram/Message', constant: true } },
    ]);
  });

  it('resolves call-ai-choice-option to its own declared `variable`, typed per its own declared dataType, marked constant', () => {
    expect(
      getContainerScopeContribution({
        name: 'call-ai-choice-option',
        data: { alias: 'Yes', dataType: { type: 'number', numberType: { type: 'any' } }, variable: 'picked' },
      }),
    ).toEqual([{ name: 'picked', type: { type: 'number', numberType: { type: 'any' }, constant: true } }]);
  });

  describe('registerContainerScopeContributor', () => {
    it('makes a dynamically registered contributor visible to getContainerScopeContribution', () => {
      registerContainerScopeContributor('human-task-option', (data) => {
        const { variable } = data as { variable: string };
        return [{ name: variable, type: { type: 'string', constant: true } }];
      });

      expect(getContainerScopeContribution({ name: 'human-task-option', data: { variable: 'task' } })).toEqual([
        { name: 'task', type: { type: 'string', constant: true } },
      ]);
    });

    it('re-registering the same node name overwrites the previous contributor rather than stacking', () => {
      registerContainerScopeContributor('some-container', () => [{ name: 'first', type: { type: 'string' } }]);
      registerContainerScopeContributor('some-container', () => [{ name: 'second', type: { type: 'boolean' } }]);

      expect(getContainerScopeContribution({ name: 'some-container', data: {} })).toEqual([
        { name: 'second', type: { type: 'boolean' } },
      ]);
    });

    it('does not shadow a statically known node kind registered under the same name', () => {
      registerContainerScopeContributor('function-body', () => [{ name: 'shadowed', type: { type: 'string' } }]);

      expect(getContainerScopeContribution({ name: 'function-body', data: { name: 'fn', parameters: [] } })).toEqual(
        [],
      );
    });
  });
});
