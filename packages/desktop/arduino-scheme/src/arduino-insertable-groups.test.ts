import { container as rootContainer, resolveService } from '@falang/di';
import {
  createNodeStoreFromNode,
  getGlobalI18n,
  setRootNodeForScheme,
  registerGlobalTokens,
  TOKEN_CONTEXT_MENU,
} from '@falang/scheme';
import { parseDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { arduinoSchemeFactory } from './arduino-scheme-factory.js';
import { initializeDriverRegistry } from './driver-nodes/driver-registry-cache.js';

const lcd = parseDriverConfig({
  id: 'lcd',
  label: 'LCD',
  includes: ['lcd.h'],
  sourceFiles: ['lcd.h', 'lcd.cpp'],
  declarations: ['declare function lcd_clear(): void;', 'declare function lcd_init(a: number): void;'],
  actions: [{ id: 'clear', label: 'Clear display', fields: [], codeTemplate: 'lcd_clear()' }],
  device: { fields: [{ name: 'a', label: 'Address', kind: 'number', default: '1' }], setupTemplate: 'lcd_init(${a})' },
  locales: { ru: { label: 'Дисплей', actions: { clear: { label: 'Очистить' } } } },
});
const servo = parseDriverConfig({
  id: 'servo',
  label: 'Servo',
  includes: ['s.h'],
  sourceFiles: ['s.h', 's.cpp'],
  declarations: ['declare function servo_set(a: number): void;'],
  actions: [{ id: 'set', label: 'Set angle', fields: [], codeTemplate: 'servo_set(1)' }],
});

interface TGroup {
  name: string;
  items: string[];
}

const menuGroups = async (connected: ReadonlySet<string> | null): Promise<TGroup[]> => {
  const built = arduinoSchemeFactory({
    id: 'd',
    name: 'doc',
    parentContainer: rootContainer,
    ...(connected ? { getConnectedDriverIds: () => connected } : {}),
  });
  setRootNodeForScheme(built, createNodeStoreFromNode(built.infra.structure.factory('function'), built));
  await getGlobalI18n().whenIdle();
  const body = built.rootNode?.children[1];
  if (!body) throw new Error('no body');
  const menu = resolveService(TOKEN_CONTEXT_MENU, built.container).buildForValencePoint({
    scheme: built,
    parent: built.icons.getIcon(body.id),
    vp: { parentId: body.id, index: 0 } as never,
  });
  built.dispose();
  return menu
    .filter((item) => item.type === 'group')
    .map((group) => ({ name: group.text, items: group.children.map((c) => (c.type === 'button' ? c.text : '')) }));
};

describe('Arduino valence-point menu groups', () => {
  beforeEach(() => {
    registerGlobalTokens();
    initializeDriverRegistry([lcd, servo]);
  });
  afterEach(async () => {
    await getGlobalI18n().setLanguage('en');
    initializeDriverRegistry([]);
  });

  it('puts pins and built-in functions into "Arduino" and driver actions into "Device"; no "Integrations" group', async () => {
    await getGlobalI18n().whenIdle();
    const groups = await menuGroups(null);
    const arduino = groups.find((group) => group.name === 'Arduino');
    expect(arduino?.items).toContain('Set digital pin');
    expect(arduino?.items).toContain('Delay');
    expect(groups.find((group) => group.name === 'Device')?.items).toEqual([
      'LCD — Clear display',
      'Servo — Set angle',
    ]);
    expect(groups.some((group) => group.name === 'Integrations')).toBe(false);
  });

  it('lists only actions of connected drivers; an empty set hides the group', async () => {
    const connected = await menuGroups(new Set(['lcd']));
    expect(connected.find((group) => group.name === 'Device')?.items).toEqual(['LCD — Clear display']);
    const none = await menuGroups(new Set());
    expect(none.some((group) => group.name === 'Device')).toBe(false);
  });

  it('translates group names, built-in titles and driver labels to the UI language', async () => {
    await getGlobalI18n().setLanguage('ru');
    await getGlobalI18n().whenIdle();
    const groups = await menuGroups(new Set(['lcd']));
    expect(groups.find((group) => group.name === 'Arduino')?.items).toContain('Задержка');
    expect(groups.find((group) => group.name === 'Устройство')?.items).toEqual(['Дисплей — Очистить']);
  });
});
