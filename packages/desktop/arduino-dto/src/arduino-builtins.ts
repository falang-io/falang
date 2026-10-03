export type TArduinoCallEmitter = (argCodes: readonly string[]) => string;

const passthroughCall =
  (name: string): TArduinoCallEmitter =>
  (args) =>
    `${name}(${args.join(', ')})`;

interface IArduinoFunctionBuiltin {
  readonly name: string;
  /** A TS-syntax parameter/return-type suffix, e.g. `(pin: number, mode: number): void` — appended straight after `declare function ${name}`. */
  readonly signature: string;
}

/** Phase 1's numbers-only MVP (see ADR 0020 (private)) — every parameter/return type here is `number`, matching the type subset the compiler otherwise supports. Sourced from the real Arduino core API, restricted to what's actually usable without string/array support. */
const ARDUINO_FUNCTIONS: readonly IArduinoFunctionBuiltin[] = [
  { name: 'pinMode', signature: '(pin: number, mode: number): void' },
  { name: 'digitalWrite', signature: '(pin: number, value: number): void' },
  { name: 'digitalRead', signature: '(pin: number): number' },
  { name: 'analogWrite', signature: '(pin: number, value: number): void' },
  { name: 'analogRead', signature: '(pin: number): number' },
  { name: 'delay', signature: '(ms: number): void' },
  { name: 'delayMicroseconds', signature: '(us: number): void' },
  { name: 'millis', signature: '(): number' },
  { name: 'micros', signature: '(): number' },
  { name: 'constrain', signature: '(x: number, low: number, high: number): number' },
  { name: 'map', signature: '(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number' },
  { name: 'random', signature: '(max: number): number' },
  { name: 'randomSeed', signature: '(seed: number): void' },
];

const PIN_CONSTANTS = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP'] as const;

/**
 * Analog input channel constants (`A0`..`A7`) used with `analogRead` — under the hood these are
 * just numbers (14..21 on an Uno), but real Arduino code always addresses them by name, never the
 * raw number. Covers Uno/Nano's `A0`-`A7`; a Mega's `A8`-`A15` aren't declared yet (see
 * ADR 0023 (private)'s pin-nodes scope note) since Phase 1's hardcoded FQBN list doesn't offer a
 * Mega board to begin with.
 */
export const ANALOG_PIN_CONSTANTS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'] as const;

/** Only the numeric-argument overloads — `Serial.print`/`println`'s string overload needs `@falang/logic-constructor`'s string support, not done in Phase 1. */
const SERIAL_METHODS = ['begin', 'print', 'println'] as const;

/**
 * Ambient TS declaration lines for `@falang/logic-constructor`'s `ICppCompileParams.extraDeclarations` —
 * without these, any expression calling one of these builtins fails the virtual file's own type-check
 * with "Cannot find name", regardless of `ARDUINO_CALL_MAP` ever being reached (see ADR 0020 (private)'s
 * Implementation notes). Declared once here so this list and `ARDUINO_CALL_MAP` can't drift apart.
 */
export const ARDUINO_BUILTIN_DECLARATIONS: readonly string[] = [
  ...PIN_CONSTANTS.map((name) => `declare const ${name}: number;`),
  ...ANALOG_PIN_CONSTANTS.map((name) => `declare const ${name}: number;`),
  ...ARDUINO_FUNCTIONS.map((fn) => `declare function ${fn.name}${fn.signature};`),
  `declare const Serial: { ${SERIAL_METHODS.map((method) => `${method}(value: number): void;`).join(' ')} };`,
];

/** `arduino-adapter.ts`'s `emitCall` whitelist — every entry here is a straight passthrough (Arduino's C++ API calls are already valid C++ syntax, nothing to translate), falling back to `cppAdapter.emitCall` (still gets `Math.*` for free) for anything not listed here. */
export const ARDUINO_CALL_MAP: Readonly<Record<string, TArduinoCallEmitter>> = {
  ...Object.fromEntries(
    ARDUINO_FUNCTIONS.map((fn): [string, TArduinoCallEmitter] => [fn.name, passthroughCall(fn.name)]),
  ),
  ...Object.fromEntries(
    SERIAL_METHODS.map((method): [string, TArduinoCallEmitter] => [
      `Serial.${method}`,
      passthroughCall(`Serial.${method}`),
    ]),
  ),
};
