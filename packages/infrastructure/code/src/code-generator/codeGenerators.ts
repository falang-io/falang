import { TGeneratorConfig } from './TGeneratorConfig';
import { cppGenerator } from './generators/cpp';
import { phpGenerator } from './generators/php';
import { rustGenerator } from './generators/rust';
import { javascriptGenerator } from './generators/javascript';

export const codeGenerators = {
  cpp: cppGenerator,
  php: phpGenerator,
  rust: rustGenerator,
  ts: javascriptGenerator,
  js: javascriptGenerator,
} as const satisfies  Record<string, TGeneratorConfig>; 

export type TCodeLanguage = keyof typeof codeGenerators;