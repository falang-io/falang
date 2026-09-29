import { zod } from '@falang/dto';

/**
 * The `Devices` document (see ADR 0032 (private), "Decision →
 * 3") — one per Arduino project, a `custom` document (`IProjectDocument.data`, no `root`) describing
 * the hardware: digital pins to configure with `pinMode(...)` and device instances (a driver with a
 * `device` section plus its connection parameters), both turned into a `setup()` prologue at compile
 * time. Plain data + zod only, dependency-free (same posture as `pin-nodes.ts`/`driver-config.ts`) so
 * the app's `main`, its renderer (through the app's own `src/shared/devices-document.ts` shim — never
 * this package's barrel, see that shim's comment) and `@falang/desktop-mcp` can all import it.
 */

export const DEVICES_DOCUMENT_TYPE = 'devices' as const;
export const DEVICES_DOCUMENT_NAME = 'Devices' as const;

export const DEVICE_PIN_MODES = ['input', 'output', 'input-pullup'] as const;
export type TDevicePinMode = (typeof DEVICE_PIN_MODES)[number];

/** `pinMode`'s second argument for each `TDevicePinMode` — the C++ identifier emitted verbatim into `setup()`. */
export const DEVICE_PIN_MODE_CPP: Readonly<Record<TDevicePinMode, string>> = {
  input: 'INPUT',
  output: 'OUTPUT',
  'input-pullup': 'INPUT_PULLUP',
};

const devicePinConfigZod = zod.object({
  /** Row identity for the editor (a uuid) — never emitted into code. */
  id: zod.string().min(1),
  pin: zod.number().int().min(0),
  mode: zod.enum(DEVICE_PIN_MODES),
  /** Free text, documentation only. */
  label: zod.string().optional(),
});
export type IDevicePinConfig = zod.infer<typeof devicePinConfigZod>;

const deviceInstanceZod = zod.object({
  id: zod.string().min(1),
  /** A driver id that declares a `device` section (see `driver-config.ts`) — validated against the loaded registry at compile time, not here. */
  driverId: zod.string().min(1),
  /** The user's own label for this instance, e.g. "Front display". */
  name: zod.string(),
  /** String-encoded values of the driver's `device.fields`, keyed by field name — the same encoding a `driver-action::…` node's `data` uses. */
  params: zod.record(zod.string(), zod.string()),
});
export type IDeviceInstance = zod.infer<typeof deviceInstanceZod>;

const devicesDocumentDataZod = zod.object({
  pins: zod.array(devicePinConfigZod),
  devices: zod.array(deviceInstanceZod),
});
export type IDevicesDocumentData = zod.infer<typeof devicesDocumentDataZod>;

export class DevicesDocumentValidationError extends Error {}

export const emptyDevicesDocumentData = (): IDevicesDocumentData => ({ pins: [], devices: [] });

/** Parses a `devices` document's `data` — throws `DevicesDocumentValidationError` on anything malformed. A `null`/`undefined` payload (a document created before it was ever edited) is treated as empty. */
export const parseDevicesDocumentData = (data: unknown): IDevicesDocumentData => {
  // `typeof data` captured first (rather than `typeof data === 'undefined'` inline) so this reads as
  // a plain string comparison — oxlint's `no-undefined` and `unicorn/no-typeof-undefined` rules would
  // otherwise fire on the two different-but-equally-obvious ways to spell "no value was passed" (same
  // workaround `@falang/versioning`'s `canonicalStringify` already uses).
  const dataType = typeof data;
  if (data === null || dataType === 'undefined') return emptyDevicesDocumentData();
  const result = devicesDocumentDataZod.safeParse(data);
  if (!result.success) {
    throw new DevicesDocumentValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; '),
    );
  }
  return result.data;
};
