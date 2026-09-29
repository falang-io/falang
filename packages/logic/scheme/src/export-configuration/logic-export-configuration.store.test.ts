import { describe, expect, it } from 'vitest';
import { LogicExportConfigurationStore } from './logic-export-configuration.store.js';

describe('LogicExportConfigurationStore', () => {
  it('starts empty', () => {
    const store = new LogicExportConfigurationStore();
    expect(store.getConfig()).toEqual({ exports: [] });
  });

  it('adds an item with defaults when no config is passed', () => {
    const store = new LogicExportConfigurationStore();
    store.addNewItem();
    expect(store.getConfig()).toEqual({ exports: [{ language: 'ts', path: './code/src/falang' }] });
  });

  it('adds an item seeded from a given config', () => {
    const store = new LogicExportConfigurationStore();
    store.addNewItem({ language: 'golang', path: './out/go' });
    expect(store.getConfig()).toEqual({ exports: [{ language: 'golang', path: './out/go' }] });
  });

  it('deletes an item by index', () => {
    const store = new LogicExportConfigurationStore();
    store.addNewItem({ language: 'ts', path: './a' });
    store.addNewItem({ language: 'rust', path: './b' });
    store.deleteItem(0);
    expect(store.getConfig()).toEqual({ exports: [{ language: 'rust', path: './b' }] });
  });

  it('setConfig replaces all items, getConfig round-trips it', () => {
    const store = new LogicExportConfigurationStore();
    const config = {
      exports: [
        { language: 'cpp', path: './cpp-out' },
        { language: 'sharp', path: './cs-out' },
      ],
    } as const;
    store.setConfig(config);
    expect(store.getConfig()).toEqual(config);
  });

  it('saveConfig/restoreOldConfig round-trips to the last saved snapshot', () => {
    const store = new LogicExportConfigurationStore();
    store.addNewItem({ language: 'ts', path: './a' });
    store.saveConfig();
    store.addNewItem({ language: 'js', path: './b' });
    store.restoreOldConfig();
    expect(store.getConfig()).toEqual({ exports: [{ language: 'ts', path: './a' }] });
  });

  it('restoreOldConfig is a no-op before saveConfig was ever called', () => {
    const store = new LogicExportConfigurationStore();
    store.addNewItem({ language: 'ts', path: './a' });
    store.restoreOldConfig();
    expect(store.getConfig()).toEqual({ exports: [{ language: 'ts', path: './a' }] });
  });

  it('getLogicOptions lists every export language once', () => {
    const store = new LogicExportConfigurationStore();
    const options = store.getLogicOptions();
    expect(options.map((o) => o.value)).toEqual(['ts', 'js', 'cpp', 'golang', 'rust', 'sharp']);
    options.forEach((o) => expect(o.text).toBe(o.value));
  });
});
