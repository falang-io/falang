import { getActionIconConfig } from '@falang/editor-scheme';
import { getForEachConfig } from '@falang/editor-scheme';
import { getFunctionIconConfig } from '@falang/editor-scheme';
import { getIfIconConfig } from '@falang/editor-scheme';
import { getPseudoCycleConfig } from '@falang/editor-scheme';
import { getSwitchIconConfig } from '@falang/editor-scheme';
import { getWhileConfig } from '@falang/editor-scheme';
import { OutDto } from '@falang/editor-scheme';
import { OutTransformer } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { CodeBlockTransformer } from './blocks/code/CodeBlock.transformer';
import { codeGenerators, TCodeLanguage } from './code-generator/codeGenerators';
import { generateCode } from './code-generator/generateCode';

export const getCodeInfrastructureConfig = (language: TCodeLanguage, codeExtension: string, name: string): IInfrastructureConfig => {
  const blockTransformer = new CodeBlockTransformer();
  const outTransformer = new OutTransformer({
    alias: 'system',
    returnBlockTransformer: blockTransformer,
    dtoConstructor: OutDto,
  });

  const generators = codeGenerators[language];
  if(!generators) {
    throw new Error(`Wrong language: ${language}`);
  }

  return {
    name,
    icons: {
      action: getActionIconConfig({ blockTransformer, codeBuilder: generators.action } ),
      function: getFunctionIconConfig({ blockTransformer, codeBuilder: generators.function }),
      if: getIfIconConfig({ blockTransformer, outTransformer, codeBuilder: generators.if }),
      switch: getSwitchIconConfig({ blockTransformer, outTransformer, codeBuilder: generators.switch }),
      while: getWhileConfig({ blockTransformer, codeBuilder: generators.while }),
      foreach: getForEachConfig({ blockTransformer, codeBuilder: generators.foreach }),
      'pseudo-cycle': getPseudoCycleConfig({ codeBuilder: generators.pseudo_cycle }),
    },
    type: 'scheme',
    skewerIcons: ["action", 'if', 'switch', 'while', 'foreach', 'pseudo-cycle'],
    outs: outTransformer,
    language,
    codeExtension,
    generateCode: (rootIcon) => generateCode(rootIcon, language),
  }
}
