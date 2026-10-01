/**
 * Browser-only wiring for `@falang/text-scheme` — a browser host imports it once from its entry file
 * (`import '@falang/text-scheme/src/browser.js'`). It only loads the stylesheet of the rich-text (Lexical)
 * block; CSS can't be imported from the package index because the index must stay loadable in plain Node.
 */
import './blocks/html/html-block.css';
