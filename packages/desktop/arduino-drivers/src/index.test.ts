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
});
