import { describe, expect, it } from 'vitest';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { schemeFactory } from '../scheme/scheme-factory.js';

describe('createNodeStoreFromNode', () => {
  it('hydrates out and mods when loading a saved document', () => {
    const infra = getTestInfrastructure();
    const scheme = schemeFactory({
      infra,
      document: {
        id: '',
        name: 'function-doc',
        root: {
          id: 'root',
          name: 'function',
          children: [
            { id: 'header', name: 'function-header', data: '' },
            {
              id: 'body',
              name: 'function-body',
              data: '',
              children: [
                // `action0` is here only so `action1` isn't `children[0]` — the first child of any
                // parent continues the main path straight down and may never carry an `out`
                // (`createZodUnion` rejects it, `canHaveOut`/`setOutNode` refuse to create it).
                { id: 'action0', name: 'action', data: '' },
                {
                  id: 'action1',
                  name: 'action',
                  data: '',
                  out: { id: 'out1', name: 'action2', data: 0 },
                  mods: [{ id: 'mod1-instance', name: 'mod1', data: 0 }],
                },
              ],
            },
            { id: 'footer', name: 'function-footer', data: '' },
          ],
        },
      },
    });

    const actionStore = scheme.nodes.getNode('action1');
    expect(actionStore.out?.id).toBe('out1');
    expect(actionStore.out?.name).toBe('action2');
    expect(actionStore.mods.map((mod) => mod.id)).toEqual(['mod1-instance']);

    expect(scheme.nodes.getNode('out1')).toBe(actionStore.out);
    expect(scheme.nodes.getNode('mod1-instance')).toBe(actionStore.mods[0]);

    expect(actionStore.out?.parent).toBe(actionStore);
    expect(actionStore.mods[0]?.parent).toBe(actionStore);

    scheme.dispose();
  });
});
