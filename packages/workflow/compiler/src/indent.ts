const INDENT_UNIT = '  ';

/** Indents every non-empty line of `code` by `levels` (default 1) levels of two spaces. */
export const indentLines = (code: string, levels = 1): string => {
  if (code === '') return code;
  const prefix = INDENT_UNIT.repeat(levels);
  return code
    .split('\n')
    .map((line) => (line === '' ? line : `${prefix}${line}`))
    .join('\n');
};
