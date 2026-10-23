import type { TVariableInfo } from '@falang/typescript-dto';
import type { ITraceEmitter } from '@falang/logic-constructor';

type TFalangVarCast = 'int32_t' | 'float' | 'bool' | 'String';

/**
 * `falang_debug.h`'s `falang_var` has overloads for `int32_t`/`float`/`bool` and `const String&`
 * (a `string` is the Arduino core's `String`, see `compile-arduino-project.ts`). Arrays, structs and
 * enums are skipped, not sent over the wire — an MVP gap, not a bug (the panel shows "N of M
 * variables traced" territory, not crashes).
 */
const classifyDebugVariableType = (type: TVariableInfo): TFalangVarCast | null => {
  if (type.type === 'boolean') return 'bool';
  if (type.type === 'string') return 'String';
  if (type.type === 'number')
    return type.numberType.type === 'float' || type.numberType.type === 'decimal' ? 'float' : 'int32_t';
  return null;
};

const indent = (code: string): string =>
  code
    .split('\n')
    .map((line) => (line === '' ? line : `  ${line}`))
    .join('\n');

/**
 * The Arduino product's own `ITraceEmitter` (ADR 0021 (private) §6) — turns a trace site into a call
 * into `falang_debug.h`'s runtime. Lives entirely in this app, same posture as `arduino-adapter.ts`:
 * `@falang/logic-constructor` never learns the word "Arduino" or "Serial".
 */
export const createArduinoTracer = (): ITraceEmitter => ({
  selectVariables: (scope) => {
    const traced: Record<string, TVariableInfo> = {};
    for (const [name, type] of Object.entries(scope)) {
      if (classifyDebugVariableType(type)) traced[name] = type;
    }
    return traced;
  },

  emitTrace: (_node, index, scope) => {
    const varLines = Object.entries(scope).map(([name, type], varIndex) => {
      const cast = classifyDebugVariableType(type);
      // `selectVariables` already dropped anything `cast` would be null for — this is just the
      // compiler's own contract, not a runtime possibility to guard against here.
      // A `String` goes by reference, no cast (a C-style cast would copy it).
      if (cast === 'String') return `falang_var(${String(varIndex)}, ${name});`;
      const value = type.type === 'number' && type.numberType.type === 'decimal' ? `${name}.toDouble()` : name;
      return `falang_var(${String(varIndex)}, (${cast ?? 'int32_t'})${value});`;
    });
    const body = [...varLines, 'falang_pause();'].join('\n');
    return `if (falang_trace(${String(index)})) {\n${indent(body)}\n}`;
  },

  emitEnter: () => 'FalangDebugFrame __falang_frame;',
  emitLeave: () => '',
});
