/**
 * `monaco-editor`'s basic-language Monarch tables (`esm/vs/basic-languages/*`) ship no `.d.ts` next
 * to their `.js` — only their `*.contribution.d.ts` (language registration, not the tokenizer itself)
 * is typed. Ambient declarations for the two modules `monaco-languages.ts` actually imports.
 */
declare module 'monaco-editor/esm/vs/basic-languages/typescript/typescript.js' {
  import type { languages } from 'monaco-editor';

  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}

declare module 'monaco-editor/esm/vs/basic-languages/javascript/javascript.js' {
  import type { languages } from 'monaco-editor';

  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
