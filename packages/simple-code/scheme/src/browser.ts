/**
 * Browser-only wiring for `@falang/simple-code-scheme`'s Monaco-backed blocks — a browser host imports it
 * once from its entry file (`import '@falang/simple-code-scheme/src/browser.js'`). Not re-exported from the
 * package index: it imports `monaco-editor`'s basic-language tokenizers, which only load in a bundler.
 * It also pulls in `@falang/typescript-scheme`'s own browser module, since these blocks run on the same
 * installed Monaco instance.
 */
// oxlint-disable-next-line triple-slash-reference -- ambient `declare module`s for the basic-language tokenizers; a renderer tsconfig importing this file does not otherwise include them
/// <reference path="./block-elements/raw-code/monaco-basic-languages.d.ts" />
import '@falang/typescript-scheme/src/browser.js';
import { conf as jsConf, language as jsLanguage } from 'monaco-editor/esm/vs/basic-languages/javascript/javascript.js';
import { conf as tsConf, language as tsLanguage } from 'monaco-editor/esm/vs/basic-languages/typescript/typescript.js';
import { installCodeLanguageTokenizers } from './block-elements/raw-code/monaco-languages.js';

installCodeLanguageTokenizers({
  typescript: { conf: tsConf, language: tsLanguage },
  javascript: { conf: jsConf, language: jsLanguage },
});
