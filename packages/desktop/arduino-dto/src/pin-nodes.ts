/**
 * The four pin node kinds (see ADR 0023 (private)) — plain data
 * shapes shared between the renderer (which declares their zod schema/editor UI, registered as an
 * `extraIconsGroups` addition to `@falang/typescript-scheme`'s `functionalSchemeFactory`) and `main`
 * (which lowers them into plain `action`/`create-var` nodes before handing the tree to
 * `compileArduinoProject` — see `lower-pin-nodes.ts`). Kept dependency-free so both processes can
 * import it without pulling in Electron/React/`@falang/logic-constructor`.
 */

export const PIN_WRITE_DIGITAL = 'pin-write-digital' as const;
export const PIN_WRITE_ANALOG = 'pin-write-analog' as const;
export const PIN_READ_DIGITAL = 'pin-read-digital' as const;
export const PIN_READ_ANALOG = 'pin-read-analog' as const;

export const PIN_NODE_NAMES = [PIN_WRITE_DIGITAL, PIN_WRITE_ANALOG, PIN_READ_DIGITAL, PIN_READ_ANALOG] as const;

export interface IPinWriteDigitalData {
  readonly pin: number;
  /** `true` → `HIGH`, `false` → `LOW`. */
  readonly value: boolean;
}

export interface IPinWriteAnalogData {
  readonly pin: number;
  /** PWM duty cycle, 0-255 (`analogWrite`'s own valid range). */
  readonly value: number;
}

export interface IPinReadData {
  readonly pin: number;
  /** Name of the new variable the read result is assigned to. */
  readonly variable: string;
}
