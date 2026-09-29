import type * as monaco from 'monaco-editor';
import { conf as jsConf, language as jsLanguage } from 'monaco-editor/esm/vs/basic-languages/javascript/javascript.js';
import { conf as tsConf, language as tsLanguage } from 'monaco-editor/esm/vs/basic-languages/typescript/typescript.js';
import type { TCodeLanguage } from '@falang/simple-code-dto';

/**
 * Private language ids for `ts`/`js` — deliberately NOT the real `'typescript'`/`'javascript'` ids.
 * `@falang/typescript-scheme`'s `getMonaco()` configures `monaco.typescript.typescriptDefaults` with
 * `strict: true` globally for those two ids (shared Monaco instance, one worker) — a raw, unvalidated
 * `code`-domain fragment created under the real id would get real TS diagnostics/red squiggles, which
 * directly contradicts this domain's "no validation" requirement. `cpp`/`php`/`rust` need no aliasing:
 * nothing in this codebase attaches a language *service* to them, only the Monarch tokenizer the full
 * `monaco-editor` package already registers for their real ids — reused as-is.
 */
const ALIAS_TS = 'falang-code-ts';
const ALIAS_JS = 'falang-code-js';

const MONACO_LANGUAGE_IDS: Record<TCodeLanguage, string> = {
  cpp: 'cpp',
  php: 'php',
  rust: 'rust',
  ts: ALIAS_TS,
  js: ALIAS_JS,
};

export const monacoLanguageId = (language: TCodeLanguage): string => MONACO_LANGUAGE_IDS[language];

let registered = false;

/** Idempotent — registers the `ts`/`js` aliases once per renderer, reusing monaco's own bundled
 * TypeScript/JavaScript Monarch tokenizer + language configuration for real syntax highlighting. */
export const registerCodeLanguages = (monacoApi: typeof monaco): void => {
  if (registered) return;
  registered = true;
  monacoApi.languages.register({ id: ALIAS_TS });
  monacoApi.languages.setLanguageConfiguration(ALIAS_TS, tsConf);
  monacoApi.languages.setMonarchTokensProvider(ALIAS_TS, tsLanguage);
  monacoApi.languages.register({ id: ALIAS_JS });
  monacoApi.languages.setLanguageConfiguration(ALIAS_JS, jsConf);
  monacoApi.languages.setMonarchTokensProvider(ALIAS_JS, jsLanguage);
};
