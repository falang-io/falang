import { CMD_INSERT_NODE } from '@falang/scheme';
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

  it('functionalSchemeFactory() accepts a timer mod on an action and draws it left of the block', () => {
    const structure = functionalSchemeFactory().infra.structure;
    const root = structure.factory('function');
    const scheme = functionalSchemeFactory({ document: { id: 'doc', type: 'contour', name: 'doc', root } });
    const bodyId = root.children?.[1]?.id ?? '';
    const action = structure.factory('action');
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: bodyId, index: 0, node: action });
    const timer = structure.factory('timer');
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: action.id, index: 0, node: timer, slot: 'mods' });
    const host = scheme.icons.getIcon(action.id);
    expect(host.mods.map((m) => m.name)).toEqual(['timer']);
    expect(host.modsLeft).toBeGreaterThan(0);
    scheme.dispose();
  });

  it('mind-tree stack has no timer mod', () => {
    const scheme = mindTreeSchemeFactory();
    expect(scheme.infra.structure.modKindNames.size).toBe(0);
    scheme.dispose();
  });
});
