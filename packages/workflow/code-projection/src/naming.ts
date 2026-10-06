// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
const CYRILLIC: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

const RESERVED = new Set([
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
  'let',
  'static',
  'yield',
  'await',
  'log',
  'TIMEOUT',
  'Promise',
]);

const transliterate = (text: string): string => [...text.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join('');

/** `"my-vendor_name"` → `myVendorName`. */
export const camelCase = (text: string): string => {
  const words = transliterate(text)
    .split(/[^a-z0-9]+/i)
    .filter((word) => word !== '');
  return words.map((word, index) => (index === 0 ? word : word[0]?.toUpperCase() + word.slice(1))).join('');
};

export const pascalCase = (text: string): string => {
  const camel = camelCase(text);
  return camel === '' ? '' : (camel[0]?.toUpperCase() ?? '') + camel.slice(1);
};

/** A display name (any language) → a valid, non-reserved JS identifier, or `fallback` if nothing usable is left. */
export const toIdentifier = (name: string, fallback: string): string => {
  let identifier = camelCase(name);
  if (identifier === '') identifier = fallback;
  if (/^\d/.test(identifier)) identifier = `${fallback}${identifier}`;
  if (RESERVED.has(identifier)) identifier = `${identifier}Instance`;
  return identifier;
};

/** The namespace a vendor's declarations live in (`http-request` → `httpRequest`). */
export const vendorNamespace = (vendor: string): string => camelCase(vendor) || 'vendor';

const stripVendorPrefix = (name: string, vendor: string): string =>
  name.startsWith(`${vendor}-`) ? name.slice(vendor.length + 1) : name;

/** `telegram-send-message` of vendor `telegram` → `sendMessage`; `call-ai-text` of `openai` → `callAiText`. */
export const actionMethodName = (actionName: string, vendor: string): string =>
  camelCase(stripVendorPrefix(actionName, vendor)) || 'run';

/** `telegram-question` → `askQuestion`; `human-task` → `askHumanTask`. */
export const questionMethodName = (questionName: string, vendor: string): string =>
  `ask${pascalCase(stripVendorPrefix(questionName, vendor))}`;

const TRIGGER_METHOD_OVERRIDES: Readonly<Record<string, string>> = {
  'telegram-trigger': 'onMessage',
};

/** `telegram-on-command-trigger` → `onCommand`; `webhook-trigger` → `onWebhook`. */
export const triggerMethodName = (triggerName: string, vendor: string): string => {
  const override = TRIGGER_METHOD_OVERRIDES[triggerName];
  if (override) return override;
  const rest = pascalCase(stripVendorPrefix(triggerName, vendor).replace(/-?trigger$/, ''));
  if (rest === '') return `on${pascalCase(vendor)}`;
  return rest.startsWith('On') ? `o${rest.slice(1)}` : `on${rest}`;
};

/** Gives every display name a unique identifier, in input order. */
export const uniqueIdentifiers = <T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  fallbackOf: (item: T) => string,
  taken: ReadonlySet<string> = new Set(),
): Map<T, string> => {
  const used = new Set(taken);
  const result = new Map<T, string>();
  for (const item of items) {
    const base = toIdentifier(nameOf(item), fallbackOf(item));
    let candidate = base;
    let counter = 2;
    while (used.has(candidate)) {
      candidate = `${base}${counter}`;
      counter += 1;
    }
    used.add(candidate);
    result.set(item, candidate);
  }
  return result;
};
