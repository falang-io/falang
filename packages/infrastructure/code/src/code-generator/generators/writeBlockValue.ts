import { CodeBlockStore } from '../../blocks/code/CodeBlock.store';
import { CodeBuilder } from '@falang/editor-scheme';

export const writeCodeBlockValue = (code: { code: string }, builder: CodeBuilder): void => {
  // builder.print(`// Falang:block-start:${code.id}`);
  builder.print(code.code);
  // builder.print(`// Falang:block-end:${code.id}`);
};