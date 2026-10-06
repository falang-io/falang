import { action, makeObservable, observable, toJS } from 'mobx';
import { localizeDriverConfig } from '@falang/desktop-arduino-dto/src/driver-localize.js';
import type { IDriverConfig } from '../../shared/driver-config.js';
import {
  DevicesDocumentValidationError,
  emptyDevicesDocumentData,
  parseDevicesDocumentData,
  type IDeviceInstance,
  type IDevicePinConfig,
  type IDevicesDocumentData,
} from '../../shared/devices-document.js';
import type { DesktopDocument } from './arduino-project-store.js';
import { generateUuid } from './generate-uuid.js';

export interface IDevicesDocumentStoreParams {
  readonly document: DesktopDocument;
  readonly drivers: readonly IDriverConfig[];
  /** Called with a plain (non-observable) snapshot after every mutation — see `emitChange` below. */
  readonly onChange: (data: IDevicesDocumentData) => void;
  readonly getLanguage?: () => string;
}

/** Parses a document's raw `data`, falling back to empty data (plus an error message) rather than
 * throwing — a hand-edited-on-disk `Devices` document shouldn't crash the whole tab. Split out of the
 * constructor as its own function (returning one object, not two `let`s reassigned in a `try`/`catch`)
 * so `data`/`error` can both stay real, always-initialized `const`s. */
const parseDevicesDataOrFallback = (
  raw: unknown,
): { readonly data: IDevicesDocumentData; readonly error: string | null } => {
  try {
    return { data: parseDevicesDocumentData(raw), error: null };
  } catch (error) {
    return {
      data: emptyDevicesDocumentData(),
      error: error instanceof DevicesDocumentValidationError ? error.message : String(error),
    };
  }
};

/**
 * The editing model behind `DevicesEditor` (see ADR 0032 (private),
 * "Decision → 3") — a plain MobX store over one `devices` document's `data`, deliberately not a
 * `Scheme`: the `Devices` document has no `root`/node tree at all (`ArduinoProjectStore.getScheme`
 * throws for it), so this is the nearest equivalent to the workflow product's `IntegrationsEditor`
 * editing `IIntegrationsDocumentData` directly rather than through a scheme. One instance is built per
 * open/reload of the document (see `DevicesEditor`'s `useMemo`), never reused across a reload — the
 * constructor is the only place `document.data` is ever parsed.
 */
export class DevicesDocumentStore {
  readonly drivers: readonly IDriverConfig[];
  private readonly onChange: (data: IDevicesDocumentData) => void;
  /** UI language for a new device's default name (it is user data afterwards and stays as typed). */
  private readonly getLanguage: () => string;

  @observable.shallow pins: IDevicePinConfig[];
  @observable.shallow devices: IDeviceInstance[];
  /** Set when `document.data` failed to parse (e.g. hand-edited on disk) — the editor starts empty
   * instead of throwing, same "don't crash the whole workspace over one bad document" posture
   * `DevicesEditor`'s caller already takes for a missing document. */
  @observable loadError: string | null = null;

  constructor(params: IDevicesDocumentStoreParams) {
    this.drivers = params.drivers;
    this.onChange = params.onChange;
    this.getLanguage = params.getLanguage ?? (() => 'en');
    // `document.data` is a MobX-observable proxy (from `ArduinoProjectStore.documents`); zod throws on its Symbol keys.
    const parsed = parseDevicesDataOrFallback(toJS(params.document.data));
    this.pins = [...parsed.data.pins];
    this.devices = [...parsed.data.devices];
    this.loadError = parsed.error;
    makeObservable(this);
  }

  /** Drivers selectable as a device instance — only those declaring a `device` section (a driver with
   * no such section is action-only, see `driver-config.ts`). */
  get deviceDrivers(): readonly IDriverConfig[] {
    return this.drivers.filter((driver) => driver.device);
  }

  private emitChange(): void {
    // `toJS` strips MobX's observable proxying before handing the snapshot to `onChange` — the same
    // reasoning `arduino-project-store.ts`'s `saveDocumentAsync` already documents for why a proxied
    // value can't cross `ipcRenderer.invoke`'s structured-clone (`onChange` ultimately feeds that path
    // via `ArduinoProjectStore.setDevicesDocumentData`).
    this.onChange(toJS({ pins: this.pins, devices: this.devices }));
  }

  @action addPin(): void {
    const usedPins = new Set(this.pins.map((pin) => pin.pin));
    let nextPin = 0;
    while (usedPins.has(nextPin)) nextPin += 1;
    this.pins.push({ id: generateUuid(), pin: nextPin, mode: 'output' });
    this.emitChange();
  }

  @action updatePin(id: string, patch: Partial<Pick<IDevicePinConfig, 'pin' | 'mode' | 'label'>>): void {
    const index = this.pins.findIndex((pin) => pin.id === id);
    if (index === -1) return;
    // A fresh object, not `Object.assign` onto the existing one — `IDevicePinConfig`'s fields are
    // `readonly` by contract (see `devices-document.ts`), and this keeps that true at the type level.
    this.pins[index] = { ...this.pins[index], ...patch };
    this.emitChange();
  }

  @action removePin(id: string): void {
    this.pins = this.pins.filter((pin) => pin.id !== id);
    this.emitChange();
  }

  @action addDevice(driverId: string): void {
    const driver = this.drivers.find((candidate) => candidate.id === driverId);
    if (!driver?.device) return;
    const initialParams: Record<string, string> = {};
    for (const field of driver.device.fields) initialParams[field.name] = field.default ?? '';
    this.devices.push({
      id: generateUuid(),
      driverId,
      name: localizeDriverConfig(driver, this.getLanguage()).label,
      params: initialParams,
    });
    this.emitChange();
  }

  @action updateDeviceName(id: string, name: string): void {
    const index = this.devices.findIndex((device) => device.id === id);
    if (index === -1) return;
    this.devices[index] = { ...this.devices[index], name };
    this.emitChange();
  }

  @action updateDeviceParam(id: string, fieldName: string, value: string): void {
    const index = this.devices.findIndex((device) => device.id === id);
    if (index === -1) return;
    const device = this.devices[index];
    this.devices[index] = { ...device, params: { ...device.params, [fieldName]: value } };
    this.emitChange();
  }

  @action removeDevice(id: string): void {
    this.devices = this.devices.filter((device) => device.id !== id);
    this.emitChange();
  }
}
