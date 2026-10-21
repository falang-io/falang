/**
 * Notes about number types (ADR 0069 (private)), split out of `node-kinds.ts` to stay under the 300-line cap. They
 * apply to every kind that takes a type; only projects that compile to C++/Go/Rust/C# (the Arduino IDE, the
 * `logic` project type) care, the workflow product compiles to TypeScript where a bare `number` is fine.
 */
const PORTABLE_NUMBERS_NOTE = [
  'In a project compiled to C++/Go/Rust/C# (Arduino sketches, logic projects) a number type must say its kind:',
  '`{ "type": "number", "numberType": { "type": "integer", "integerType": "int32" } }` (also int8/int16/int64 and',
  'uint8/uint16/uint32/uint64 when available), `{ …"type": "float", "floatType": "float32" | "float64" }`, or',
  '`{ …"type": "decimal", "digits": 10, "decimals": 2 }` (exact fixed point, digits 1-18). Never',
  '`"numberType": { "type": "any" }`, the general `any` or `enum` there — they cannot be compiled and the icon is',
  'shown with an error. In a workflow project (TypeScript) a bare `numberType: any` is fine.',
].join(' ');

export const NUMBER_TYPE_NODE_KIND_NOTES: Record<string, string> = {
  'create-var': `The variable's \`variableType\` is a type. ${PORTABLE_NUMBERS_NOTE}`,
  'function-body': `Parameter types and the return type are types. ${PORTABLE_NUMBERS_NOTE}`,
};
