import { registerScopeContributor, type IScopeVariable } from '@falang/typescript-common';
import { int32Type } from '@falang/typescript-dto';
import { MICROS, MILLIS, RANDOM } from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { buildDriverActionNodeName } from '@falang/desktop-arduino-dto/src/driver-node-name.js';
import {
  driverActionVariableName,
  driverResultTypeToVariableType,
} from '@falang/desktop-arduino-dto/src/driver-result-type.js';
import { PIN_READ_ANALOG, PIN_READ_DIGITAL } from '@falang/desktop-arduino-dto/src/pin-nodes.js';

/**
 * Scope contributors (ADR 0068 (private)): the Arduino nodes that declare a variable do it through lowering passes in
 * `@falang/desktop-arduino-compiler` (`create-var` with the same name/type), so the editor's scope walk — which only
 * knows `create-var`/`arr-*` statically — needs the same facts registered by name. Types are the lowering's: `int32`
 * for pin reads / `millis` / `micros` / `random`, the action's `resultType` for a driver action.
 */
const variableFrom = (variable: unknown, type: IScopeVariable['type']): IScopeVariable | undefined => {
  if (typeof variable !== 'string' || variable === '') return;
  return { name: variable, type };
};

const dataOf = (data: unknown): Record<string, unknown> =>
  data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {};

/** Pin reads, `millis`, `micros`, `random` — fixed kinds, idempotent. */
export const registerArduinoScopeContributors = (): void => {
  for (const name of [PIN_READ_DIGITAL, PIN_READ_ANALOG, MILLIS, MICROS, RANDOM]) {
    registerScopeContributor(name, (data) => variableFrom(dataOf(data)['variable'], int32Type));
  }
};

/**
 * One contributor per driver action with a `new-variable` field and a `resultType`. The name is the stored value, else
 * the field default, else `result` — exactly what `lowerDriverNodes` gives the generated `create-var`. Registering by
 * name overwrites, so a re-registration after a driver change wins; a removed driver's stale entry is harmless.
 */
export const registerDriverScopeContributors = (drivers: readonly IDriverConfig[]): void => {
  for (const driver of drivers) {
    for (const action of driver.actions) {
      const field = action.fields.find((f) => f.kind === 'new-variable');
      if (!field || !action.resultType) continue;
      const type = driverResultTypeToVariableType(action.resultType);
      registerScopeContributor(buildDriverActionNodeName(driver.id, action.id), (data) =>
        variableFrom(driverActionVariableName(dataOf(data), field), type),
      );
    }
  }
};
