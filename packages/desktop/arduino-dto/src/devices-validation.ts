import type { IDriverConfig, IDriverFieldDescriptor } from './driver-config.js';
import { driverFieldProblem } from './driver-field-problem.js';
import {
  DevicesDocumentValidationError,
  parseDevicesDocumentData,
  type IDeviceInstance,
  type IDevicesDocumentData,
} from './devices-document.js';

export interface IDevicesValidationIssue {
  /** e.g. `devices[2].params.address` */
  readonly path: string;
  readonly message: string;
}

export type TPrepareDevicesResult =
  | { readonly ok: true; readonly data: IDevicesDocumentData }
  | { readonly ok: false; readonly errors: readonly IDevicesValidationIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const newId = (): string => globalThis.crypto.randomUUID();

/** Fills a missing/empty row `id`, so an agent can send rows without inventing identities. Returns fresh objects. */
const withIds = (rows: unknown): unknown =>
  Array.isArray(rows)
    ? rows.map((row) =>
        isRecord(row) && (typeof row.id !== 'string' || row.id === '') ? { ...row, id: newId() } : row,
      )
    : rows;

/** Absent params take their field's default (only for an instance whose driver is known and has a `device` section). */
const withDefaults = (devices: unknown, drivers: readonly IDriverConfig[]): unknown => {
  if (!Array.isArray(devices)) return devices;
  return devices.map((device) => {
    if (!isRecord(device) || typeof device.driverId !== 'string') return device;
    const fields = drivers.find((driver) => driver.id === device.driverId)?.device?.fields ?? [];
    const params: Record<string, unknown> = isRecord(device.params) ? { ...device.params } : {};
    for (const field of fields) {
      if (!(field.name in params) && typeof field.default === 'string') params[field.name] = field.default;
    }
    return { ...device, params };
  });
};

const rangeProblem = (field: IDriverFieldDescriptor, value: string): string | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `field "${field.name}" must be a number, got "${value}"`;
  if (typeof field.min === 'number' && parsed < field.min) return `field "${field.name}" must be >= ${field.min}`;
  if (typeof field.max === 'number' && parsed > field.max) return `field "${field.name}" must be <= ${field.max}`;
  return null;
};

const typedValueProblem = (field: IDriverFieldDescriptor, value: string): string | null => {
  if (field.kind === 'boolean') {
    return value === 'true' || value === 'false' ? null : `field "${field.name}" must be "true" or "false"`;
  }
  return field.kind === 'number' || field.kind === 'pin' ? rangeProblem(field, value) : null;
};

const fieldIssues = (device: IDeviceInstance, fields: readonly IDriverFieldDescriptor[], path: string) => {
  const issues: IDevicesValidationIssue[] = [];
  const names = new Set(fields.map((field) => field.name));
  for (const key of Object.keys(device.params)) {
    if (!names.has(key)) {
      issues.push({
        message: `unknown field "${key}" (fields: ${[...names].join(', ') || 'none'})`,
        path: `${path}.params.${key}`,
      });
    }
  }
  for (const field of fields) {
    const value = device.params[field.name];
    const problem = driverFieldProblem(field, value) ?? (value ? typedValueProblem(field, value) : null);
    if (problem) issues.push({ message: problem, path: `${path}.params.${field.name}` });
  }
  return issues;
};

const deviceIssues = (device: IDeviceInstance, drivers: readonly IDriverConfig[], path: string) => {
  const driver = drivers.find((candidate) => candidate.id === device.driverId);
  if (!driver) {
    const known = drivers.filter((candidate) => candidate.device).map((candidate) => candidate.id);
    return [
      {
        message: `unknown driver "${device.driverId}" (drivers with a device section: ${known.join(', ') || 'none'})`,
        path: `${path}.driverId`,
      },
    ];
  }
  if (!driver.device) {
    return [
      {
        message: `driver "${driver.id}" has no "device" section, so it cannot be added to Devices (use its actions instead)`,
        path: `${path}.driverId`,
      },
    ];
  }
  return fieldIssues(device, driver.device.fields, path);
};

const parseOrIssue = (input: Record<string, unknown>, drivers: readonly IDriverConfig[]): TPrepareDevicesResult => {
  try {
    const data = parseDevicesDocumentData({
      devices: withDefaults(withIds(input.devices ?? []), drivers),
      pins: withIds(input.pins ?? []),
    });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof DevicesDocumentValidationError ? error.message : String(error);
    return { errors: [{ message, path: '(schema)' }], ok: false };
  }
};

const rowIssues = (data: IDevicesDocumentData, drivers: readonly IDriverConfig[]): IDevicesValidationIssue[] => {
  const errors: IDevicesValidationIssue[] = [];
  const seenPins = new Map<number, number>();
  const seenIds = new Set<string>();
  const checkId = (id: string, path: string): void => {
    if (seenIds.has(id)) errors.push({ message: `duplicate id "${id}"`, path });
    seenIds.add(id);
  };
  for (const [index, pin] of data.pins.entries()) {
    const path = `pins[${index}]`;
    checkId(pin.id, path);
    const first = seenPins.get(pin.pin);
    if (first === null || typeof first !== 'number') seenPins.set(pin.pin, index);
    else errors.push({ message: `pin ${pin.pin} is already configured at pins[${first}]`, path: `${path}.pin` });
  }
  for (const [index, device] of data.devices.entries()) {
    const path = `devices[${index}]`;
    checkId(device.id, path);
    errors.push(...deviceIssues(device, drivers, path));
  }
  return errors;
};

/**
 * The one validation of a `Devices` document an agent (in-app or MCP) writes (ADR 0054 (private)): schema
 * (`parseDevicesDocumentData`), unique ids and pin numbers, every instance refers to a driver in `drivers` that has a
 * `device` section, and every param matches that section's `fields`. Missing row ids are generated and absent params
 * take their field default. `drivers` is the effective set (what a build would use). Never throws.
 */
export const prepareDevicesData = (input: unknown, drivers: readonly IDriverConfig[]): TPrepareDevicesResult => {
  if (!isRecord(input)) {
    return { errors: [{ message: 'expected an object { pins, devices }', path: '(root)' }], ok: false };
  }
  const parsed = parseOrIssue(input, drivers);
  if (!parsed.ok) return parsed;
  const errors = rowIssues(parsed.data, drivers);
  return errors.length > 0 ? { errors, ok: false } : parsed;
};

/** One-line-per-issue text for a tool error result. */
export const formatDevicesIssues = (errors: readonly IDevicesValidationIssue[]): string =>
  errors.map((error) => `${error.path}: ${error.message}`).join('\n');
