import { CodeBlockStore } from '../../blocks/code/CodeBlock.store';
import { CodeBuilder } from '@falang/editor-scheme';
import { TGeneratorConfig } from '../TGeneratorConfig';
import { writeCodeBlockValue } from './writeBlockValue';

export const cppGenerator: TGeneratorConfig = {
  //"timing-side": () => "",
  action: ({ code, builder, icon }) => {
    writeCodeBlockValue(code, builder);
  },
  commentLinePrefix: '//',
  foreach: ({ icon, code, builder, generateIcon }) => {
    writeCodeBlockValue(code, builder);
    builder.openQuote();
    icon.skewer.icons.forEach(child => generateIcon(child));
    builder.closeQuote();
  },
  function: ({ icon, builder, generateIcon, code }) => {
    generateIcon(icon.header);
    writeCodeBlockValue(icon.header.block as CodeBlockStore, builder);
    builder.openQuote();
    builder.print('int _continueValue = 0;');
    builder.print('int _breakValue = 0;');
    icon.skewer.icons.forEach(child => generateIcon(child));
    if (code.code.indexOf('return') === -1 || code.code.indexOf('return;') !== -1) return;
    writeCodeBlockValue(icon.footer.block as CodeBlockStore, builder);
    builder.closeQuote();
  },
  if: ({ icon, code, builder, generateIcon }) => {
    builder.print('if(');
    builder.indentPlus();
    writeCodeBlockValue(code, builder);
    builder.indentMinus();
    builder.print(') {');
    builder.indentPlus();
    generateIcon(icon.threads.icons[icon.trueOnRight ? 1 : 0]);
    builder.indentMinus();
    builder.print('} else {');
    builder.indentPlus();
    generateIcon(icon.threads.icons[icon.trueOnRight ? 0 : 1]);
    builder.closeQuote();
  },
  parallel: ({ icon, builder, generateIcon }) => {
    //
  },
  pseudo_cycle: ({ icon, builder, generateIcon }) => {
    builder.print('while(true) {');
    builder.indentPlus();
    icon.skewer.icons.forEach(child => generateIcon(child));
    builder.closeQuote();
  },
  switch: ({ icon, code, builder, generateIcon }) => {
    builder.print('switch(')
    builder.plus();
    writeCodeBlockValue(code, builder);
    builder.minus();
    builder.print(') {')
    builder.indentPlus();
    icon.threads.icons.forEach(threadIcon => {
      const codeValue = (threadIcon.block as CodeBlockStore).code;
      const isDefault = codeValue.trim().startsWith('default');
      if (isDefault) {
        builder.print('default: {');
      } else {
        builder.print('case');
        builder.indentPlus();
        writeCodeBlockValue(threadIcon.block as CodeBlockStore, builder);
        builder.indentMinus();
        builder.print(': {');
      }
      builder.plus();
      threadIcon.skewer.icons.forEach(child => generateIcon(child));
      builder.minus();
      builder.print('}');
      if (isDefault) builder.print('break;');
    });
    builder.minus();
    builder.print('}');
  },
  while: ({ icon, code, builder, generateIcon }) => {
    builder.print('while (true) {');
    builder.plus();
    icon.skewer.icons.forEach(child => generateIcon(child));
    builder.print(`if (${icon.trueIsMain ? '' : '!'}(`)
    builder.indentPlus()
    writeCodeBlockValue(code, builder);
    builder.indentMinus();
    builder.print(')) break;');
    builder.minus();
    builder.print('}');
    afterBreakable(builder);
  },
  lifegram:() => {},
};

const afterBreakable = (builder: CodeBuilder) => {
  builder.print('if (_continueValue > 1) { _continueValue--; break; }');
  builder.print('if (_continueValue === 1) { _continueValue = 0; continue; }');
  builder.print('if (_breakValue > 0) { _breakValue--; break; }');
}
