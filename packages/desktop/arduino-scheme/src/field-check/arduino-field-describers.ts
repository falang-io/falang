import { resolveService } from '@falang/di';
import type { NodeStore } from '@falang/scheme';
import {
  identifierField,
  registerFieldDescriber,
  registerFieldDescriberResolver,
  templateField,
  typedField,
  type ICheckedField,
  type IFieldCheckContext,
  type TFieldDescriber,
} from '@falang/typescript-scheme';
import {
  driverActionVariableName,
  NUMBER_EXPRESSION_TYPE,
} from '@falang/desktop-arduino-dto/src/driver-result-type.js';
import { MICROS, MILLIS, RANDOM } from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';
import { PIN_READ_ANALOG, PIN_READ_DIGITAL } from '@falang/desktop-arduino-dto/src/pin-nodes.js';
import { TOKEN_DRIVER_REGISTRY } from '../driver-nodes/driver-registry-token.js';
import type { DriverRegistryStore, IResolvedDriverAction } from '../driver-nodes/driver-registry.store.js';

const dataOf = (node: NodeStore): Record<string, unknown> =>
  node.data !== null && typeof node.data === 'object' ? (node.data as Record<string, unknown>) : {};

/** The stored string value of a field; the editors' constructors fall back to `''`/the field default the same way. */
const textOf = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

/** `pin-read-*` / `millis` / `micros` / `random`: one new-variable field `variable`; their other fields are plain number inputs. */
const describeNewVariableOnly: TFieldDescriber = (node, ctx) => [
  identifierField(node, ctx, 'variable', textOf(dataOf(node)['variable'])),
];

const getRegistry = (ctx: IFieldCheckContext): DriverRegistryStore | null => {
  if (!ctx.container) return null;
  try {
    return resolveService(TOKEN_DRIVER_REGISTRY, ctx.container);
  } catch {
    return null;
  }
};

/**
 * Driver action fields: `string` is a scope-checked template body, `number-expression` an expression of type
 * `number`, `new-variable` declares an identifier; `pin`,
 * `select`, `boolean` and `number` are plain controls. An empty `string` field is a valid (empty) template body, so
 * nothing is `allowEmpty` here; an empty `new-variable` is checked as it stands, like the editor's store does.
 */
const describeDriverAction = (
  node: NodeStore,
  ctx: IFieldCheckContext,
  resolved: IResolvedDriverAction,
): ICheckedField[] => {
  const data = dataOf(node);
  const fields: ICheckedField[] = [];
  for (const field of resolved.action.fields) {
    // Same fallback as `DriverActionBlockEditorStore`'s constructor: stored value, else the field default.
    const value = textOf(data[field.name], field.default ?? '');
    if (field.kind === 'string') fields.push(templateField(node, ctx, field.name, value));
    else if (field.kind === 'number-expression')
      fields.push(typedField(node, ctx, field.name, value, NUMBER_EXPRESSION_TYPE));
    else if (field.kind === 'new-variable')
      fields.push(identifierField(node, ctx, field.name, driverActionVariableName(data, field)));
  }
  return fields;
};

let registered = false;

/**
 * Registers the Arduino blocks' field describers (ADR 0068 (private)): the pin-read / `millis` / `micros` / `random`
 * kinds by name, every `driver-action::…` kind through a resolver backed by the scheme's driver registry
 * (`TOKEN_DRIVER_REGISTRY`, found through `ctx.container`). Pin-write, `delay*`, `serial-*` and the other driver
 * field kinds are plain number/toggle/slider controls and are not checked. Idempotent.
 */
export const registerArduinoFieldDescribers = (): void => {
  if (registered) return;
  registered = true;
  for (const name of [PIN_READ_DIGITAL, PIN_READ_ANALOG, MILLIS, MICROS, RANDOM]) {
    registerFieldDescriber(name, describeNewVariableOnly);
  }
  registerFieldDescriberResolver({
    resolve: (node, ctx) => {
      const resolved = getRegistry(ctx)?.findAction(node.name);
      if (resolved) return (n, c) => describeDriverAction(n, c, resolved);
    },
  });
};
