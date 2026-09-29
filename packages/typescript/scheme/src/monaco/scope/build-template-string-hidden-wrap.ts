export interface ITemplateStringHiddenWrap {
  hiddenPrefix: string;
  hiddenSuffix: string;
}

/**
 * Wraps `scopeCode` in a hidden opening/closing backtick, so a field's raw text type-checks as
 * the body of a TS template literal — giving real autocomplete/type errors inside `${...}`
 * interpolations — while the backticks stay invisible to the user. The stored `value` is the
 * bare string content with no backticks, so a compiler is free to render it however it likes
 * (plain string, template literal, …).
 */
export const buildTemplateStringHiddenWrap = (scopeCode: string): ITemplateStringHiddenWrap => ({
  hiddenPrefix: `${scopeCode}\`\n`,
  hiddenSuffix: '\n`;',
});
