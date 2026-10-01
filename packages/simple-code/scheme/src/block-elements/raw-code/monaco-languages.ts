import type * as monaco from 'monaco-editor';
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

/** monaco's bundled Monarch tokenizer + language configuration for one language. */
export interface IMonarchLanguageBundle {
  conf: monaco.languages.LanguageConfiguration;
  language: monaco.languages.IMonarchLanguage;
}

export interface ICodeLanguageTokenizers {
  typescript: IMonarchLanguageBundle;
  javascript: IMonarchLanguageBundle;
}

let tokenizers: ICodeLanguageTokenizers | null = null;

/**
 * Host-installed (see `@falang/simple-code-scheme/src/browser.js`): the tokenizers live in
 * `monaco-editor/esm/...` modules, which this package must not import at runtime — it has to stay
 * importable in plain Node.
 */
export const installCodeLanguageTokenizers = (installed: ICodeLanguageTokenizers): void => {
  tokenizers = installed;
};

let registered = false;

/** Idempotent — registers the `ts`/`js` aliases once per renderer, reusing monaco's own bundled
 * TypeScript/JavaScript Monarch tokenizer + language configuration for real syntax highlighting. */
export const registerCodeLanguages = (monacoApi: typeof monaco): void => {
  if (registered) return;
  if (!tokenizers) {
    throw new Error(
      'simple-code language tokenizers are not installed. A browser host must import ' +
        '`@falang/simple-code-scheme/src/browser.js` (or call `installCodeLanguageTokenizers`) once at startup.',
    );
  }
  registered = true;
  monacoApi.languages.register({ id: ALIAS_TS });
  monacoApi.languages.setLanguageConfiguration(ALIAS_TS, tokenizers.typescript.conf);
  monacoApi.languages.setMonarchTokensProvider(ALIAS_TS, tokenizers.typescript.language);
  monacoApi.languages.register({ id: ALIAS_JS });
  monacoApi.languages.setLanguageConfiguration(ALIAS_JS, tokenizers.javascript.conf);
  monacoApi.languages.setMonarchTokensProvider(ALIAS_JS, tokenizers.javascript.language);
};
