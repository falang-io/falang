/**
 * Browser-only wiring for `@falang/typescript-scheme`'s Monaco-backed blocks. Every browser host
 * (workflow client, `app-sketch`, `app-arduino`, the playgrounds) imports this module once from its entry
 * file — `import '@falang/typescript-scheme/src/browser.js'` — before any scheme is built. It is deliberately
 * NOT re-exported from the package index: it imports `monaco-editor` itself, a bundler-specific `?worker`
 * module and CSS, none of which load in plain Node. A headless host (plain `tsx`, no UI) simply never
 * imports it; `getMonaco()` then throws a clear "not installed" error if a code block is ever created.
 */
import * as monaco from 'monaco-editor';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';
import lightPrismThemeCss from 'prismjs/themes/prism.css?raw';
import darkPrismThemeCss from 'prismjs/themes/prism-tomorrow.css?raw';
import './monaco/monaco-styles.css';
import './block-elements/code/prism-styles.css';
import { installMonaco } from './monaco/get-monaco.js';
import { installPrismThemes } from './block-elements/code/prism-theme.js';

installMonaco(monaco, { getWorker: () => new tsWorker() });
installPrismThemes({ light: lightPrismThemeCss, dark: darkPrismThemeCss });
