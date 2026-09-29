import { describe, expect, it } from 'vitest';
import { buildDriverActionNodeName, parseDriverActionNodeName } from './driver-node-name.js';

describe('driver-node-name', () => {
  it('round-trips driverId/actionId through build/parse', () => {
    const name = buildDriverActionNodeName('dht', 'read-temperature');
    expect(name).toBe('driver-action::dht::read-temperature');
    expect(parseDriverActionNodeName(name)).toEqual({ driverId: 'dht', actionId: 'read-temperature' });
  });

  it('returns null for a name that is not a driver-action node name', () => {
    expect(parseDriverActionNodeName('action')).toBeNull();
    expect(parseDriverActionNodeName('pin-write-digital')).toBeNull();
    expect(parseDriverActionNodeName('driver-action::only-one-part')).toBeNull();
  });
});
