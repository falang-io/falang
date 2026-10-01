import { zod } from '@falang/dto';

/**
 * The `driver.config.json` shape (see ADR 0023 (private), "Driver
 * system shape" + "Implementation notes (Phase B/C)") — plain data, dependency-free so both `main`
 * (registry loading, lowering) and the renderer (dynamic node/block generation) can import it, matching
 * `pin-nodes.ts`'s precedent. A driver contributes one or more *actions*; each action becomes its own
 * `driver-action::{driverId}::{actionId}` node kind (see `driver-node-name.ts`) — deliberately NOT one
 * generic node name for every action, a correction to this ADR's literal text made while implementing
 * Phase C (the icon-palette insertion mechanism requires one distinct `INodeConfig` name per distinct
 * default-`data` preset — see the ADR's "Implementation notes (Phase B/C)" for the full reasoning).
 */

export const DRIVER_FIELD_KINDS = ['pin', 'number', 'string', 'boolean', 'select', 'new-variable'] as const;
export type TDriverFieldKind = (typeof DRIVER_FIELD_KINDS)[number];

export const DRIVER_RESULT_TYPES = ['int', 'float', 'bool', 'string'] as const;
export type TDriverResultType = (typeof DRIVER_RESULT_TYPES)[number];

/** Identifier-safe: usable as a `${placeholder}` name in a `codeTemplate` and as a zod object key. */
const identifierZod = zod
  .string()
  .min(1)
  .regex(/^[a-zA-Z_]\w*$/, 'must be a valid identifier');

/** Kebab-case: usable as a path segment (driver folder name) and inside a node name (see `driver-node-name.ts`). */
const kebabCaseZod = zod
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, 'must be kebab-case');

/** No path separators/`..` — `sourceFiles`/`includes` name flat files inside the driver's own folder only, never escape it (see the ADR's Phase C security note). */
const flatFileNameZod = zod
  .string()
  .min(1)
  .regex(/^[\w.-]+$/, 'must be a flat filename with no path separators');

/** Plain-English, LLM-facing description (ADR 0054 (private)) — what the device/action is; shown by `list_drivers` and in `get_node_kinds`. */
const notesZod = zod.string().min(1);

const selectOptionZod = zod.object({
  /** Always a raw numeric literal, substituted verbatim into `codeTemplate` — see the ADR's field-substitution rules. */
  value: zod.string().regex(/^-?\d+$/, 'select option values must be numeric'),
  label: zod.string().min(1),
});

const driverFieldDescriptorZod = zod.object({
  name: identifierZod,
  label: zod.string().min(1),
  kind: zod.enum(DRIVER_FIELD_KINDS),
  /** String-encoded default (e.g. `"13"`, `"true"`, `"Hello"`) — required for every kind except `new-variable`, which the UI defaults to a generated name. */
  default: zod.string().optional(),
  min: zod.number().optional(),
  max: zod.number().optional(),
  options: zod.array(selectOptionZod).optional(),
});
export type IDriverFieldDescriptor = zod.infer<typeof driverFieldDescriptorZod>;

const driverActionDescriptorZod = zod.object({
  id: kebabCaseZod,
  label: zod.string().min(1),
  fields: zod.array(driverFieldDescriptorZod),
  /** Field values are substituted by name — `${pin}`, `${text}`, etc. See `substituteCodeTemplate`. */
  codeTemplate: zod.string().min(1),
  resultType: zod.enum(DRIVER_RESULT_TYPES).optional(),
  notes: notesZod.optional(),
});
export type IDriverActionDescriptor = zod.infer<typeof driverActionDescriptorZod>;

/**
 * Makes this driver a "built-in device" a project's `Devices` document can list (see
 * ADR 0032 (private), "Decision → 3") — one line spliced into
 * `setup()`'s compiled body per device instance, ahead of any `driver-action::…` call. `fields` reuses
 * `driverFieldDescriptorZod`, but `new-variable` is rejected (`parseDriverConfig` below) since a
 * setup line declares nothing to assign a result to, unlike an action's `codeTemplate`.
 */
const driverDeviceDescriptorZod = zod.object({
  fields: zod.array(driverFieldDescriptorZod),
  /** Field values are substituted by name the same way `codeTemplate` is — see `substituteTemplate`. Never terminated with `;` here; the caller (`setup-prologue.ts`) appends it. */
  setupTemplate: zod.string().min(1),
});
export type IDriverDeviceDescriptor = zod.infer<typeof driverDeviceDescriptorZod>;

export const driverConfigZod = zod.object({
  id: kebabCaseZod,
  label: zod.string().min(1),
  version: zod.string().optional(),
  /** Header filenames (relative to this driver's own folder) `#include`d in the generated sketch. */
  includes: zod.array(flatFileNameZod),
  /** Every file (headers + `.cpp`) copied into the sketch directory when this driver is used. */
  sourceFiles: zod.array(flatFileNameZod).min(1),
  /** Ambient TS `declare function`/`declare const` lines for every C++ symbol this driver's actions call — see `ARDUINO_BUILTIN_DECLARATIONS` for the precedent this mirrors. Declare-only: never emitted into the generated `.ino`, so a malicious line can confuse the type-checker at worst, not inject C++ (see the ADR's Phase C security note). */
  declarations: zod.array(zod.string().regex(/^declare (function|const) [A-Za-z_]\w*\b/, 'must be a declare line')),
  actions: zod.array(driverActionDescriptorZod).min(1),
  device: driverDeviceDescriptorZod.optional(),
  notes: notesZod.optional(),
});
export type IDriverConfig = zod.infer<typeof driverConfigZod>;

export class DriverConfigValidationError extends Error {}

/** Every non-`new-variable` field referenced by a `${name}` placeholder in `template` must be declared — catches typos without requiring every declared field to actually be used. Shared by an action's `codeTemplate` and a `device`'s `setupTemplate` (see `driverDeviceDescriptorZod`), hence the generic `template`/`fields`/`context` params rather than an `IDriverActionDescriptor`. */
const validateTemplatePlaceholders = (
  template: string,
  fields: readonly IDriverFieldDescriptor[],
  context: string,
): void => {
  const fieldNames = new Set(fields.map((field) => field.name));
  const placeholders = [...template.matchAll(/\$\{([a-zA-Z_]\w*)\}/g)].map((match) => match[1]);
  for (const name of placeholders) {
    if (!fieldNames.has(name)) {
      throw new DriverConfigValidationError(`${context}: template references unknown field "${name}"`);
    }
  }
};

const validateResultShape = (action: IDriverActionDescriptor): void => {
  const newVariableFields = action.fields.filter((field) => field.kind === 'new-variable');
  if (newVariableFields.length > 1) {
    throw new DriverConfigValidationError(`action "${action.id}": at most one "new-variable" field is allowed`);
  }
  const hasNewVariableField = newVariableFields.length === 1;
  if (action.resultType && !hasNewVariableField) {
    throw new DriverConfigValidationError(
      `action "${action.id}": resultType is set but no "new-variable" field exists`,
    );
  }
  if (!action.resultType && hasNewVariableField) {
    throw new DriverConfigValidationError(`action "${action.id}": has a "new-variable" field but no resultType`);
  }
};

/** Shared by an action's `fields` and a `device`'s `fields` (see `validateTemplatePlaceholders`'s own doc comment for why these validators are generic rather than `IDriverActionDescriptor`-shaped). */
const validateSelectOptions = (fields: readonly IDriverFieldDescriptor[], context: string): void => {
  for (const field of fields) {
    if (field.kind === 'select' && (!field.options || field.options.length === 0)) {
      throw new DriverConfigValidationError(`${context}: field "${field.name}" is a "select" with no options`);
    }
  }
};

/** A `device` section declares no result variable, unlike an action — `new-variable` would have nothing to assign to, so it's rejected outright rather than silently ignored (matching the ADR's own "a setup line declares nothing" reasoning). */
const validateDeviceFields = (device: IDriverDeviceDescriptor): void => {
  const newVariableField = device.fields.find((field) => field.kind === 'new-variable');
  if (newVariableField) {
    throw new DriverConfigValidationError(
      `device: field "${newVariableField.name}" cannot be "new-variable" — a setup line declares nothing`,
    );
  }
};

/** Parses and validates a `driver.config.json` payload — throws `DriverConfigValidationError` (structural zod failures are wrapped into the same type) on anything malformed, so a caller (the registry loader) can skip one bad driver without crashing the app. */
export const parseDriverConfig = (json: unknown): IDriverConfig => {
  const result = driverConfigZod.safeParse(json);
  if (!result.success) throw new DriverConfigValidationError(result.error.issues.map((i) => i.message).join('; '));
  for (const action of result.data.actions) {
    validateResultShape(action);
    validateSelectOptions(action.fields, `action "${action.id}"`);
    validateTemplatePlaceholders(action.codeTemplate, action.fields, `action "${action.id}"`);
  }
  if (result.data.device) {
    validateDeviceFields(result.data.device);
    validateSelectOptions(result.data.device.fields, 'device');
    validateTemplatePlaceholders(result.data.device.setupTemplate, result.data.device.fields, 'device');
  }
  return result.data;
};
