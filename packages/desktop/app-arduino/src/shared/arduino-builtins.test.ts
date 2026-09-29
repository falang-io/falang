import { describe, expect, it } from 'vitest';
import { ARDUINO_BUILTIN_DECLARATIONS, ARDUINO_CALL_MAP } from './arduino-builtins.js';

describe('arduino-builtins', () => {
  it('declares every global function in ARDUINO_CALL_MAP as an ambient declaration', () => {
    const globalFunctionNames = Object.keys(ARDUINO_CALL_MAP).filter((name) => !name.includes('.'));
    for (const name of globalFunctionNames) {
      expect(ARDUINO_BUILTIN_DECLARATIONS.some((line) => line.includes(`function ${name}(`))).toBe(true);
    }
  });

  it('declares Serial as an ambient const with every whitelisted method', () => {
    const serialDeclaration = ARDUINO_BUILTIN_DECLARATIONS.find((line) => line.startsWith('declare const Serial'));
    expect(serialDeclaration).toBeDefined();
    for (const name of Object.keys(ARDUINO_CALL_MAP).filter((key) => key.startsWith('Serial.'))) {
      const method = name.split('.')[1];
      expect(serialDeclaration).toContain(`${method}(`);
    }
  });

  it('declares pin-state constants as numbers', () => {
    expect(ARDUINO_BUILTIN_DECLARATIONS).toContain('declare const HIGH: number;');
    expect(ARDUINO_BUILTIN_DECLARATIONS).toContain('declare const LOW: number;');
    expect(ARDUINO_BUILTIN_DECLARATIONS).toContain('declare const OUTPUT: number;');
  });

  it('emits a plain passthrough call for a global function', () => {
    expect(ARDUINO_CALL_MAP.pinMode?.(['13', 'OUTPUT'])).toBe('pinMode(13, OUTPUT)');
  });

  it('emits a plain passthrough call for a Serial method', () => {
    expect(ARDUINO_CALL_MAP['Serial.println']?.(['42'])).toBe('Serial.println(42)');
  });
});
