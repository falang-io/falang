/**
 * [dayjs](https://day.js.org) is available to every workflow expression as the global `dayjs`, with no
 * import written by the user: when a compiled document mentions the identifier, the workflows module
 * imports it, these plugins and locales, and extends it once at module scope (`buildDayjsRuntimeCode`).
 * Only the workflows module — activities never contain user code. Inside the Temporal sandbox
 * `dayjs()` reads the workflow's deterministic clock (`Date` is replaced there), so it is replay-safe.
 *
 * The same lists drive the backend's allowlist of import specifiers (`WORKFLOW_DAYJS_MODULE_SPECIFIERS`)
 * and the editor's Monaco declarations (`@falang/workflow-client`'s `dayjs-monaco-libs.ts`). Plugin order
 * matters: `timezone` needs `utc` extended first.
 */
export const WORKFLOW_DAYJS_PLUGINS = [
  'utc',
  'timezone',
  'customParseFormat',
  'duration',
  'relativeTime',
  'isBetween',
  'isSameOrBefore',
  'isSameOrAfter',
] as const;

/** Locales loaded next to the built-in `en` (a locale file registers itself; the global default stays `en`). */
export const WORKFLOW_DAYJS_LOCALES = ['ru'] as const;

export const WORKFLOW_DAYJS_MODULE_SPECIFIERS: readonly string[] = [
  'dayjs',
  ...WORKFLOW_DAYJS_PLUGINS.map((plugin) => `dayjs/plugin/${plugin}`),
  ...WORKFLOW_DAYJS_LOCALES.map((locale) => `dayjs/locale/${locale}`),
];

const DAYJS_IDENTIFIER = /\bdayjs\b/;

/** Whether compiled user code refers to `dayjs` (a string or comment that merely mentions it costs one unused import). */
export const usesDayjs = (code: string): boolean => DAYJS_IDENTIFIER.test(code);

const pluginBinding = (plugin: string): string => `__falangDayjs${plugin.charAt(0).toUpperCase()}${plugin.slice(1)}`;

/** Imports and module-scope setup emitted into the workflows module of a project that uses `dayjs`. */
export const buildDayjsRuntimeCode = (): string =>
  [
    "import dayjs from 'dayjs';",
    ...WORKFLOW_DAYJS_PLUGINS.map((plugin) => `import ${pluginBinding(plugin)} from 'dayjs/plugin/${plugin}';`),
    ...WORKFLOW_DAYJS_LOCALES.map((locale) => `import 'dayjs/locale/${locale}';`),
    '',
    ...WORKFLOW_DAYJS_PLUGINS.map((plugin) => `dayjs.extend(${pluginBinding(plugin)});`),
  ].join('\n');
