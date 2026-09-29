/**
 * Wraps `scopeCode` with a hidden `let` declaration typed as `typeExpression`, forcing whatever
 * expression the user types after it to type-check against that type without exposing the
 * assignment itself. Shared by every block field that must accept "a value of type T"
 * (arr-op-input's `value`, arr-insert's `insertArr`, and any future non-array typed field, e.g.
 * a `log` node's `message: string`).
 */
export const buildTypedValueHiddenPrefix = (scopeCode: string, typeExpression: string): string =>
  `${scopeCode}let _value: ${typeExpression} = \n`;
