const I18N_KEY_RE = /^[\w-]+:[\w.-]+$/;

/**
 * Translates a field label/help that is an i18n key (`ns:key`); literal text (vendors without locales,
 * e.g. `tbank`) is returned as is — passing it through `t()` would cut everything before a `:` off as a namespace.
 */
export const translateFieldText = (t: (key: string) => string, text: string): string =>
  I18N_KEY_RE.test(text) ? t(text) : text;

export interface IHelpLinePart {
  readonly text: string;
  readonly code: boolean;
}

/** Splits one help line on backticks: odd segments are code. An unpaired backtick is kept as text. */
export const splitHelpLine = (line: string): IHelpLinePart[] => {
  const segments = line.split('`');
  if (segments.length % 2 === 0) return [{ text: line, code: false }];
  return segments.map((text, index) => ({ text, code: index % 2 === 1 })).filter((part) => part.text.length > 0);
};
