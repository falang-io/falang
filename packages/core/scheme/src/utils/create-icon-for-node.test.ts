import { describe, expect, it } from 'vitest';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { checker } from '../checker.js';

describe('createIconForNode: loading a saved document', () => {
  it('creates out and mod icons for every node in the tree, not just the root', () => {
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
                { id: 'action1', name: 'action', data: '', mods: [{ id: 'mod1-instance', name: 'mod1', data: 0 }] },
              ],
              out: { id: 'out1', name: 'out', meta: { outLevel: 1 } },
            },
            { id: 'footer', name: 'function-footer', data: '' },
          ],
        },
      },
    });

    const bodyIcon = scheme.icons.getIcon('body');
    if (!checker.isWithSkewer(bodyIcon)) throw new Error('function-body icon should be a skewer icon');
    expect(bodyIcon.skewer.out?.id).toBe('out1');
    expect(checker.isOut(bodyIcon.skewer.out)).toBe(true);
    expect(scheme.icons.getIconSafe('out1')).toBe(bodyIcon.skewer.out);

    const actionIcon = scheme.icons.getIcon('action1');
    expect(actionIcon.mods.map((mod) => mod.id)).toEqual(['mod1-instance']);
    expect(scheme.icons.getIconSafe('mod1-instance')).toBe(actionIcon.mods[0]);

    scheme.dispose();
  });
});
