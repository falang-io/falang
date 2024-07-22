import { InfrastructureType } from '@falang/editor-scheme';
import { TCodeLanguage } from './code-generator/codeGenerators';
import { getCodeInfrastructureConfig } from './CodeInfrastructure.config';

export class CodeInfrastructureType extends InfrastructureType<ReturnType<typeof getCodeInfrastructureConfig>> {
  constructor(language: TCodeLanguage, codeExtension: string, name: string) {
    super(getCodeInfrastructureConfig(language, codeExtension, name));
  }
}
