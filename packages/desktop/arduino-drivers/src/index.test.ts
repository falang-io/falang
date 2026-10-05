import { describe, expect, it } from 'vitest';
import { loadDriverRegistryFromDirs } from '@falang/desktop-arduino-dto';
import { BUNDLED_DRIVERS_DIR } from './index.js';

describe('BUNDLED_DRIVERS_DIR', () => {
  it('points at the six bundled drivers, all of which load and validate', async () => {
    const registry = await loadDriverRegistryFromDirs([BUNDLED_DRIVERS_DIR]);
    expect(registry.errors).toEqual([]);
    expect(registry.drivers.map((driver) => driver.config.id).toSorted()).toEqual([
      'dht',
      'hc-sr04',
      'lcd1602-i2c',
      'lcd1602-parallel',
      'rgb-strip',
      'servo',
    ]);
  });

  it('every bundled driver is connectable as a device and has a complete Russian translation', async () => {
    const registry = await loadDriverRegistryFromDirs([BUNDLED_DRIVERS_DIR]);
    for (const { config } of registry.drivers) {
      expect(config.device, `${config.id} has a device section`).toBeDefined();
      const ru = config.locales?.ru;
      expect(ru?.label, `${config.id} label`).toBeTruthy();
      for (const action of config.actions) {
        const localized = ru?.actions?.[action.id];
        expect(localized?.label, `${config.id}/${action.id} label`).toBeTruthy();
        for (const field of action.fields) {
          expect(localized?.fields?.[field.name]?.label, `${config.id}/${action.id}.${field.name}`).toBeTruthy();
        }
      }
      for (const field of config.device?.fields ?? []) {
        expect(ru?.device?.fields?.[field.name]?.label, `${config.id} device.${field.name}`).toBeTruthy();
      }
    }
  });
});
