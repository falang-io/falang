/**
 * Appended after the hidden suffix on its own hidden line. Without it, a file with no `import`/`export` is a TS global
 * script, so `declare const`s from the hidden prefix leak into the shared global scope of the language service — two
 * fields declaring the same scope variable name then collide with "Cannot redeclare block-scoped variable". Forcing
 * module detection scopes them per-file instead.
 */
export const MODULE_MARKER = '\nexport {};';

/** The text the type checker sees for one field: hidden prefix, the user's value, hidden suffix and the module marker. */
export const buildModelText = (prefix: string, value: string, suffix: string): string =>
  `${prefix}${value}${suffix}${MODULE_MARKER}`;
