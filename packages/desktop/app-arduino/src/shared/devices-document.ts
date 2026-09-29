// The `Devices` document contract lives in `@falang/desktop-arduino-dto` (see
// ADR 0032 (private), "Decision → 3") so `@falang/desktop-mcp`
// can share it. Re-exported here for both `main` and the renderer — deliberately not the package's
// main barrel, see `driver-config.ts`'s copy of this comment for why (the barrel re-exports
// `driver-registry.ts`'s `node:fs`/`node:path` usage into the renderer).
export {
  DEVICES_DOCUMENT_TYPE,
  DEVICES_DOCUMENT_NAME,
  DEVICE_PIN_MODES,
  DEVICE_PIN_MODE_CPP,
  DevicesDocumentValidationError,
  emptyDevicesDocumentData,
  parseDevicesDocumentData,
} from '@falang/desktop-arduino-dto/src/devices-document.js';
export type {
  TDevicePinMode,
  IDevicePinConfig,
  IDeviceInstance,
  IDevicesDocumentData,
} from '@falang/desktop-arduino-dto/src/devices-document.js';
