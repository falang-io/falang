import { IconStore } from '@falang/editor-scheme';
import { CodeBlockStore } from '../blocks/code/CodeBlock.store';
import { CodeBuilder } from '@falang/editor-scheme';
import { codeGenerators, TCodeLanguage } from './codeGenerators';

export const generateCode = (rootIcon: IconStore, language: TCodeLanguage): string => {
  const builder = new CodeBuilder();
  const generators = codeGenerators[language];
  if(!generators) {
    return `No generator for language: ${language}`
  }  

  const generateIcon = (icon: IconStore): void => {
    const hashedId = icon.id;
    const spaces = " ".repeat(Math.max(2, 24 - icon.alias.length - builder.indentValue * 2));
    builder.print(`// Falang:icon-start:${icon.alias}${spaces}${hashedId}`);
    const iconConfig =  icon.scheme.infrastructure.config.icons[icon.alias];
    if(!iconConfig) {
      builder.print(`// !!! Not found config for icon ${icon.alias} (${icon.id})`);
    } else {
      const codeBuilder = iconConfig.codeBuilder;
      if(!codeBuilder) {
        builder.print(`// !!! Not found generator for icon ${icon.alias} (${icon.id})`);
      } else {
        codeBuilder({
          icon,
          builder,
          code: icon.block as CodeBlockStore,
          generateIcon,
        });
      }
    }
    builder.print(`// Falang:icon-end:${icon.alias}  ${spaces}${hashedId}`);
  };

  if(generators.fileStart) {
    builder.print(generators.fileStart);
  }
  generateIcon(rootIcon);
  if(generators.fileEnd) {
    builder.print(generators.fileEnd);
  }

  return builder.get();
};
