import { describe, expect, it, vi } from 'vitest';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import type { IDevicesDocumentData } from '@falang/desktop-arduino-dto/src/devices-document.js';
import { DevicesToolProvider, type IDevicesToolHost } from './devices-tool-provider.js';

const lcd = {
  actions: [],
  declarations: [],
  device: {
    fields: [{ kind: 'number', label: 'Address', name: 'address' }],
    setupTemplate: 'lcd_init(${address})',
  },
  id: 'lcd',
  includes: [],
  label: 'LCD',
  sourceFiles: [],
} as unknown as IDriverConfig;

const makeHost = () => ({
  getDevices: () => ({ devices: [], pins: [] }),
  listDeviceDrivers: () => [lcd],
  setDevices: vi.fn<IDevicesToolHost['setDevices']>(),
});
const call = (name: string, input: unknown) => ({ id: '1', input, name });

describe('DevicesToolProvider', () => {
  it('offers get_devices and set_devices', () => {
    expect(new DevicesToolProvider(makeHost()).tools.map((tool) => tool.name)).toEqual(['get_devices', 'set_devices']);
  });

  it('get_devices returns the document', async () => {
    const result = await new DevicesToolProvider(makeHost()).execute(call('get_devices', {}));
    expect(JSON.parse((result as { content: string }).content)).toEqual({ devices: [], pins: [] });
  });

  it('set_devices validates then writes through the host', async () => {
    const host = makeHost();
    const result = await new DevicesToolProvider(host).execute(
      call('set_devices', { devices: [{ driverId: 'lcd', name: 'L', params: { address: '39' } }], pins: [] }),
    );
    expect(result.ok).toBe(true);
    const written = host.setDevices.mock.calls[0]?.[0] as IDevicesDocumentData;
    expect(written.devices[0]).toMatchObject({ driverId: 'lcd', params: { address: '39' } });
    expect(written.devices[0]?.id).toBeTruthy();
  });

  it('set_devices fails with a path and writes nothing on a bad instance', async () => {
    const host = makeHost();
    const result = await new DevicesToolProvider(host).execute(
      call('set_devices', { devices: [{ driverId: 'ghost', name: 'L', params: {} }], pins: [] }),
    );
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain('devices[0].driverId');
    expect(host.setDevices).not.toHaveBeenCalled();
  });
});
