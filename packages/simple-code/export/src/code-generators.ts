import type { TCodeLanguage } from '@falang/simple-code-dto';
import { cppGenerator } from './generators/cpp.js';
import { javascriptGenerator } from './generators/javascript.js';
import { phpGenerator } from './generators/php.js';
import { rustGenerator } from './generators/rust.js';
import type { ICodeGeneratorConfig } from './generators/types.js';

/** `ts`/`js` share one generator (identical control-flow syntax) — same mapping the old app used. */
export const codeGenerators: Record<TCodeLanguage, ICodeGeneratorConfig> = {
  cpp: cppGenerator,
  php: phpGenerator,
  rust: rustGenerator,
  ts: javascriptGenerator,
  js: javascriptGenerator,
};
