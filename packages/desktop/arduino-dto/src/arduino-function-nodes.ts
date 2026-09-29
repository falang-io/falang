/**
 * Nine more Arduino built-in-function node kinds (see ADR 0023 (private)),
 * alongside the four pin node kinds in `pin-nodes.ts` — plain data shapes shared between the renderer
 * (which declares their zod schema/editor UI, registered as an `extraIconsGroups` addition to
 * `@falang/typescript-scheme`'s `functionalSchemeFactory`) and `main` (which lowers them into plain
 * `action`/`create-var` nodes before handing the tree to `compileArduinoProject` — see
 * `lower-arduino-function-nodes.ts`). Kept dependency-free so both processes can import it without
 * pulling in Electron/React/`@falang/logic-constructor`.
 *
 * Three data shapes cover all nine kinds:
 * - `ISingleNumberActionData` (`delay`/`delay-microseconds`/`random-seed`/`serial-begin`/`serial-print`/
 *   `serial-println`) — one literal numeric argument, no return value.
 * - `IZeroArgReadData` (`millis`/`micros`) — no arguments, result assigned to a new variable.
 * - `IRandomData` (`random`) — one literal numeric argument (`max`) *and* a result variable.
 */

export const DELAY = 'delay' as const;
export const DELAY_MICROSECONDS = 'delay-microseconds' as const;
export const MILLIS = 'millis' as const;
export const MICROS = 'micros' as const;
export const RANDOM = 'random' as const;
export const RANDOM_SEED = 'random-seed' as const;
export const SERIAL_BEGIN = 'serial-begin' as const;
export const SERIAL_PRINT = 'serial-print' as const;
export const SERIAL_PRINTLN = 'serial-println' as const;

export const ARDUINO_FUNCTION_NODE_NAMES = [
  DELAY,
  DELAY_MICROSECONDS,
  MILLIS,
  MICROS,
  RANDOM,
  RANDOM_SEED,
  SERIAL_BEGIN,
  SERIAL_PRINT,
  SERIAL_PRINTLN,
] as const;

export interface ISingleNumberActionData {
  readonly value: number;
}

export interface IZeroArgReadData {
  /** Name of the new variable the call's result is assigned to. */
  readonly variable: string;
}

export interface IRandomData {
  /** `random`'s exclusive upper bound. */
  readonly max: number;
  /** Name of the new variable the call's result is assigned to. */
  readonly variable: string;
}
