import { describe, expect, it } from 'vitest';
import {
  DevicesDocumentValidationError,
  emptyDevicesDocumentData,
  parseDevicesDocumentData,
} from './devices-document.js';

describe('parseDevicesDocumentData', () => {
  it('treats a missing payload as empty', () => {
    // oxlint-disable-next-line init-declarations no-unassigned-vars -- exercising the "no value passed" branch itself needs a real, never-assigned `undefined`, without writing the literal token (`no-undefined`/`no-useless-undefined`).
    let missing: unknown;
    expect(parseDevicesDocumentData(missing)).toEqual(emptyDevicesDocumentData());
    expect(parseDevicesDocumentData(null)).toEqual({ pins: [], devices: [] });
  });

  it('accepts a well-formed payload', () => {
    const data = {
      pins: [{ id: 'p1', pin: 13, mode: 'output', label: 'LED' }],
      devices: [{ id: 'd1', driverId: 'lcd1602-i2c', name: 'Display', params: { address: '39' } }],
    };
    expect(parseDevicesDocumentData(data)).toEqual(data);
  });

  it('rejects a negative pin, an unknown mode and a non-string param', () => {
    expect(() => parseDevicesDocumentData({ pins: [{ id: 'p', pin: -1, mode: 'output' }], devices: [] })).toThrow(
      DevicesDocumentValidationError,
    );
    expect(() => parseDevicesDocumentData({ pins: [{ id: 'p', pin: 1, mode: 'analog' }], devices: [] })).toThrow(
      DevicesDocumentValidationError,
    );
    expect(() =>
      parseDevicesDocumentData({ pins: [], devices: [{ id: 'd', driverId: 'x', name: '', params: { a: 1 } }] }),
    ).toThrow(DevicesDocumentValidationError);
  });
});
