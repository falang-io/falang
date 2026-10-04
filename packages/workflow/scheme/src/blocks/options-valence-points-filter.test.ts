import { DEFAULT_MODES, ICONS_DRAGGING_MODE_NAME, type IValencePoint, type Scheme } from '@falang/scheme';
import { describe, expect, it } from 'vitest';
import type { IntegrationsRegistryStore } from '../registry/integrations-registry.store.js';
import { filterOptionsValencePoints } from './options-valence-points-filter.js';

const registry = {
  findQuestion: (name: string) => (name === 'ask' ? {} : null),
  findChoice: (name: string) => (name === 'pick' ? {} : null),
} as unknown as IntegrationsRegistryStore;

const NODE_NAMES: Record<string, string> = { q: 'ask', c: 'pick', s: 'switch', body: 'function-body' };

const fakeScheme = (mode: string): Scheme =>
  ({
    mode: { value: mode },
    nodes: { getNodeSafe: (id: string) => (NODE_NAMES[id] ? { name: NODE_NAMES[id] } : null) },
  }) as unknown as Scheme;

const vp = (parentId: string, type: IValencePoint['type'] = 'in-switch'): IValencePoint => ({
  id: `vp-${parentId}-${type}`,
  parentId,
  index: 0,
  x: 0,
  y: 0,
  type,
});

const POINTS = [vp('q'), vp('c'), vp('s'), vp('body', 'in-skewer'), vp('q', 'in-skewer')];

describe('filterOptionsValencePoints', () => {
  it("hides question/choice branch points, keeping other switches' and every skewer point", () => {
    const ids = filterOptionsValencePoints(POINTS, fakeScheme(DEFAULT_MODES.START), registry).map((p) => p.id);
    expect(ids).toEqual(['vp-s-in-switch', 'vp-body-in-skewer', 'vp-q-in-skewer']);
  });

  it.each([DEFAULT_MODES.TRANSFER, ICONS_DRAGGING_MODE_NAME])('keeps them all while moving icons (%s)', (mode) => {
    expect(filterOptionsValencePoints(POINTS, fakeScheme(mode), registry)).toEqual(POINTS);
  });
});
