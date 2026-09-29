export const IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Words a TypeScript variable declaration can never use as its name. */
export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  // ECMAScript keywords
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  // Strict-mode (future) reserved words — modules are always strict, so these are unsafe too
  'implements',
  'interface',
  'let',
  'package',
  'private',
  'protected',
  'public',
  'static',
  'yield',
  // Reserved for top-level await in ES modules
  'await',
]);

/**
 * Validates a candidate variable name against TypeScript identifier syntax and the set of
 * names already visible in the enclosing scope. Returns a human-readable error, or `null`
 * when the name is valid.
 */
export const validateVariableName = (name: string, scopeNames: readonly string[]): string | null => {
  if (name === '') return 'Введите имя переменной';
  if (!IDENTIFIER_RE.test(name)) {
    return 'Имя переменной может содержать только латинские буквы, цифры, "_" и "$", и не должно начинаться с цифры';
  }
  if (RESERVED_WORDS.has(name)) {
    return `«${name}» — зарезервированное слово TypeScript`;
  }
  if (scopeNames.includes(name)) {
    return `Переменная «${name}» уже объявлена в этой области видимости`;
  }
  return null;
};
