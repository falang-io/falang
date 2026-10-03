const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&amp;': '&',
};

const ENTITY_PATTERN = /&(?:lt|gt|quot|#39|nbsp|amp);/g;

/**
 * Fields that used to be edited through the HTML text block (`while` condition, `switch`, `return`/`throw`, …)
 * may hold HTML-escaped text (`x &lt; 10`) saved by the old `innerHTML`-based editor. Decodes the few entities
 * `innerHTML` produces, in one pass (so `&amp;lt;` becomes `&lt;`, not `<`). Text without entities is returned as is.
 */
export const decodeLegacyHtml = (value: string): string =>
  ENTITY_PATTERN.test(value) ? value.replace(ENTITY_PATTERN, (entity) => ENTITIES[entity] ?? entity) : value;
