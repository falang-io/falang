import type { ILlmToolCall, ILlmToolDefinition, IAgentToolProvider, TToolExecutionResult } from '@falang/agent';
import { formatDevicesIssues, prepareDevicesData } from '@falang/desktop-arduino-dto/src/devices-validation.js';
import { DEVICE_PIN_MODES, type IDevicesDocumentData } from '@falang/desktop-arduino-dto/src/devices-document.js';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';

/**
 * What `DevicesToolProvider` needs from its host: the effective driver set (what a build would use), the current
 * `Devices` document data and a writer. `setDevices` must persist the (already validated) data the way a manual edit
 * does — save, refresh the open `DevicesEditor`, adopt referenced library drivers — before it resolves.
 */
export interface IDevicesToolHost {
  getDevices(): Promise<IDevicesDocumentData> | IDevicesDocumentData;
  listDeviceDrivers(): Promise<readonly IDriverConfig[]> | readonly IDriverConfig[];
  setDevices(data: IDevicesDocumentData): Promise<void> | void;
}

const ok = (content: string): TToolExecutionResult => ({ content, ok: true });
const fail = (error: string): TToolExecutionResult => ({ error, ok: false });

const TOOLS: readonly ILlmToolDefinition[] = [
  {
    description:
      "Read-only. Returns the project's Devices document: { pins, devices }. pins are digital pins configured with " +
      'pinMode(...) at the start of setup(); devices are instances of drivers that have a `device` section (see ' +
      'list_drivers), each with its connection params. Call it before set_devices — set_devices replaces everything.',
    inputSchema: { properties: {}, type: 'object' },
    name: 'get_devices',
  },
  {
    description:
      'Replaces the whole Devices document (so start from get_devices and keep what the user already has). pins: ' +
      '[{ pin, mode: input|output|input-pullup, label? }], one row per pin number. devices: [{ driverId, name, params }] ' +
      "where driverId is a driver with a `device` section and params maps each of that driver's device fields to a " +
      'string value (absent params take the field default). Row ids are generated when omitted. Nothing is written if ' +
      'any row is invalid (the errors name the path). Use it after set_driver to add an instance of a new driver; its ' +
      'setup template is then compiled into setup().',
    inputSchema: {
      properties: {
        devices: {
          items: {
            properties: {
              driverId: { type: 'string' },
              id: { type: 'string' },
              name: { type: 'string' },
              params: { additionalProperties: { type: 'string' }, type: 'object' },
            },
            required: ['driverId', 'name'],
            type: 'object',
          },
          type: 'array',
        },
        pins: {
          items: {
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              mode: { enum: [...DEVICE_PIN_MODES], type: 'string' },
              pin: { minimum: 0, type: 'integer' },
            },
            required: ['pin', 'mode'],
            type: 'object',
          },
          type: 'array',
        },
      },
      required: ['pins', 'devices'],
      type: 'object',
    },
    name: 'set_devices',
  },
];

/** `IAgentToolProvider` for the `Devices` document: `get_devices`, `set_devices` (ADR 0054 (private) follow-up). Node-safe. */
export class DevicesToolProvider implements IAgentToolProvider {
  readonly tools = TOOLS;

  private readonly host: IDevicesToolHost;

  constructor(host: IDevicesToolHost) {
    this.host = host;
  }

  async execute(call: ILlmToolCall): Promise<TToolExecutionResult> {
    try {
      if (call.name === 'get_devices') return ok(JSON.stringify(await this.host.getDevices()));
      if (call.name === 'set_devices') {
        const prepared = prepareDevicesData(call.input, await this.host.listDeviceDrivers());
        if (!prepared.ok) return fail(`set_devices: nothing was written.\n${formatDevicesIssues(prepared.errors)}`);
        await this.host.setDevices(prepared.data);
        return ok(JSON.stringify({ ...prepared.data, written: true }));
      }
      return fail(`Unknown tool: ${call.name}`);
    } catch (error) {
      return fail(`${call.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
