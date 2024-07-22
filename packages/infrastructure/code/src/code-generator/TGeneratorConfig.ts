import { iconTypes } from './iconTypes';
import { CodeBlockStore } from '../blocks/code/CodeBlock.store';
import { IconStore, CodeBuilder } from '@falang/editor-scheme';

interface IGeneratorParams<T extends IconStore = IconStore> {
  icon: T
  builder: CodeBuilder
  generateIcon: (icon: IconStore) => void
}

export interface IGeneratorParamsWithCode<T extends IconStore = IconStore> extends IGeneratorParams<T> {
  code: { code: string }
}

export type TIconGeneragor<T extends IconStore = IconStore> 
  = (params: IGeneratorParamsWithCode<T>) => void;

export type TGeneratorConfig = {
  [key in keyof typeof iconTypes]: TIconGeneragor<InstanceType<typeof iconTypes[key]>>
} & {
  commentLinePrefix?: string
  fileStart?: string;
  fileEnd?: string;
}

export type TCodeGenerators = Record<string, TGeneratorConfig>;