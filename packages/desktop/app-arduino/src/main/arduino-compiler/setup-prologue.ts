import type { IProjectDocument } from '@falang/dto';
import {
  DEVICE_PIN_MODE_CPP,
  DevicesDocumentValidationError,
  parseDevicesDocumentData,
  type IDevicesDocumentData,
} from '../../shared/devices-document.js';
import type { IDriverConfig } from '../../shared/driver-config.js';
import { substituteTemplate } from './substitute-driver-template.js';

/** Parses `document.data` and wraps a `DevicesDocumentValidationError` into a plain `Error` naming the document — a helper (rather than an inline `let` + `try`/`catch` in `buildSetupPrologue`) so the parsed value can stay a single `const`. */
const parseDevicesDataOrThrow = (document: IProjectDocument): IDevicesDocumentData => {
  try {
    return parseDevicesDocumentData(document.data);
  } catch (error) {
    if (!(error instanceof DevicesDocumentValidationError)) throw error;
    // oxlint-disable-next-line unicorn/prefer-type-error -- re-wrapping a validation error to name the
    // offending document, not a type-checking guard; `DevicesDocumentValidationError` (caught above) is
    // already the right error type for "invalid data" — a `TypeError` would be misleading here.
    throw new Error(`Devices document "${document.name}" is invalid: ${error.message}`, { cause: error });
  }
};

export interface IBuildSetupPrologueParams {
  /** The project's `Devices` document (`documents.find(d => d.type === DEVICES_DOCUMENT_TYPE)`), if any — a pre-ADR 0032 (private) project has none, so this is optional and yields an empty prologue. */
  readonly devicesDocument?: IProjectDocument;
  /** The full loaded driver registry — only drivers actually referenced by a device instance affect the result, same posture as `ICompileArduinoProjectParams.drivers`. */
  readonly drivers: readonly IDriverConfig[];
}

export interface IBuildSetupPrologueResult {
  /** One line per pin/device entry, in the `Devices` document's own order — no trailing `;`, `compile-arduino-project.ts`'s `injectSetupPrologue` doesn't add one either (`pinMode(13, OUTPUT);` already carries its own). */
  readonly lines: string[];
  /** Every driver id referenced by at least one device instance — merged into `compileArduinoProject`'s own `usedDriverIds` *before* `#include`s/source-file copying are computed, so a device-only driver (no `driver-action::…` node anywhere) still ships (see the ADR's "Decision → 3": "marks its driver as used ... even when no driver-action node references it"). */
  readonly usedDriverIds: ReadonlySet<string>;
}

/**
 * Turns a project's `Devices` document (ADR 0032 (private),
 * "Decision → 3") into the lines `compileArduinoProject` splices into `setup()`'s compiled body, right
 * after its opening brace (`injectSetupPrologue`, generalized from the debug-attach-only
 * `injectSetupDebugAttach` this ADR replaces) — one `pinMode(...)` per configured pin, in document
 * order, then one call per device instance (its driver's own `device.setupTemplate`, substituted with
 * the instance's `params` the same way an action's `codeTemplate` is — see `substituteTemplate`).
 *
 * Never silently skips a problem: a `Devices` document with structurally invalid `data`, a device
 * instance naming an unknown driver, or one naming a driver with no `device` section (action-only,
 * e.g. `dht`/`hc-sr04`/`rgb-strip`) all throw a plain `Error` whose message names both the `Devices`
 * document and the offending instance, matching every other Arduino-compile failure's "throw, never
 * skip" posture (`assertValidEntryFunction`, `lowerDriverNodes`'s unknown-driver/action checks).
 */
export const buildSetupPrologue = ({
  devicesDocument,
  drivers,
}: IBuildSetupPrologueParams): IBuildSetupPrologueResult => {
  if (!devicesDocument) return { lines: [], usedDriverIds: new Set() };

  const data = parseDevicesDataOrThrow(devicesDocument);

  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const usedDriverIds = new Set<string>();
  const lines: string[] = [];

  for (const pin of data.pins) {
    lines.push(`pinMode(${String(pin.pin)}, ${DEVICE_PIN_MODE_CPP[pin.mode]});`);
  }

  for (const instance of data.devices) {
    const driver = driversById.get(instance.driverId);
    if (!driver) {
      throw new Error(
        `Devices document "${devicesDocument.name}": device "${instance.name}" references unknown driver "${instance.driverId}" — is it still installed?`,
      );
    }
    if (!driver.device) {
      throw new Error(
        `Devices document "${devicesDocument.name}": device "${instance.name}" uses driver "${instance.driverId}", which has no "device" section (action-only)`,
      );
    }
    usedDriverIds.add(driver.id);
    const code = substituteTemplate(driver.device.setupTemplate, driver.device.fields, instance.params);
    lines.push(`${code};`);
  }

  return { lines, usedDriverIds };
};
