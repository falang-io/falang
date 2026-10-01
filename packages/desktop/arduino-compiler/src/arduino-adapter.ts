import { cppAdapter, type ILanguageAdapter } from '@falang/logic-constructor';
import { ARDUINO_CALL_MAP, type TArduinoCallEmitter } from '@falang/desktop-arduino-dto';

const passthroughCall =
  (name: string): TArduinoCallEmitter =>
  (args) =>
    `${name}(${args.join(', ')})`;

/**
 * A cpp-family adapter — Arduino sketches compile with `avr-g++`/`xtensa-esp32-elf-g++`, so every
 * operator/property/element-access mapping `cppAdapter` already established applies unchanged.
 * Layers an Arduino builtin-call whitelist (`pinMode`/`digitalWrite`/`Serial.*`/…) on top, falling
 * back to `cppAdapter.emitCall` for anything else (`Math.*` keeps working for free). `target` stays
 * `'cpp'` (inherited from the spread) — `@falang/logic-constructor` deliberately never learns the
 * word "Arduino" (see ADR 0020 (private)), so there's no `'arduino'` `TExportLanguage` value to
 * set it to; this adapter lives entirely in this app instead.
 *
 * `extraCallNames` (added for ADR 0023 (private)'s device drivers) are treated as one more
 * passthrough whitelist layered on top of `ARDUINO_CALL_MAP` — one entry per driver function actually
 * used by the compiled project (`compile-arduino-project.ts` derives this from the used drivers'
 * `declarations`), rather than a blanket "any bare identifier passes" rule: keeps `emitCall` a real
 * whitelist in isolation (see `arduino-adapter.test.ts`'s "throws for a call in neither whitelist"),
 * with the driver registry as the one place new entries get added, the same shape
 * `ARDUINO_CALL_MAP` itself already has for the fixed builtins.
 */
export const buildArduinoAdapter = (extraCallNames: readonly string[] = []): ILanguageAdapter => {
  const extraCallMap: Readonly<Record<string, TArduinoCallEmitter>> = Object.fromEntries(
    extraCallNames.map((name): [string, TArduinoCallEmitter] => [name, passthroughCall(name)]),
  );
  return {
    ...cppAdapter,
    emitCall: (params) => {
      const emit = ARDUINO_CALL_MAP[params.qualifiedCalleeText] ?? extraCallMap[params.qualifiedCalleeText];
      return emit ? emit(params.argCodes) : cppAdapter.emitCall(params);
    },
    // Overrides `cppAdapter`'s own `<sstream>`-based `std::ostringstream` implementation: AVR/ESP32
    // sketches have no `<sstream>` (Arduino cores don't ship a usable `std::ostringstream`), so this
    // builds the same value with the Arduino core's own `String` class instead (bundled via
    // `<Arduino.h>`, constructible from every scalar/string type this compiler produces — no per-type
    // inspection needed here either, same "let the target's own generic formatting handle it" posture
    // `cppAdapter.emitTemplateLiteral` already documents). Always ends in `.c_str()`, giving a
    // `const char*` — the type every driver action's own C++ declaration expects for a text field
    // (see ADR 0023 (private)'s driver actions) — which also converts implicitly into a
    // `std::string` wherever this target's own string scope variables are used instead, so the result
    // is safe to embed either way. The temporary `String` this builds lives until the end of the
    // enclosing full expression (a standard C++ lifetime rule), so returning `.c_str()` from it is
    // safe as a function argument or initializer, the same idiom Arduino sketches commonly rely on.
    emitTemplateLiteral: ({ segments }) => {
      if (segments.length === 0) return '(String("")).c_str()';
      const parts = segments.map((segment) =>
        segment.isExpr ? `String(${segment.text})` : `String(${cppAdapter.formatStringLiteral(segment.text)})`,
      );
      return `(${parts.join(' + ')}).c_str()`;
    },
  };
};

/** Every caller that has no driver-derived call names (Phase 1's own tests, e.g.) keeps using this singleton. */
export const arduinoAdapter: ILanguageAdapter = buildArduinoAdapter();
