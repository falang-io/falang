import { IconDto } from '../icons/base/Icon.dto';
import { IconStore } from '../icons/base/Icon.store';
import { IconTransformer } from '../icons/base/Icon.transformer';
import { OutTransformer } from '../common/outs/Out.transformer';
import { CodeBuilder } from '../common/utils/CodeBuilder';

interface IGeneratorParams<T extends IconStore = IconStore> {
  icon: T
  builder: CodeBuilder
  generateIcon: (icon: IconStore) => void
}

export interface IGeneratorParamsWithCode<T extends IconStore = IconStore> extends IGeneratorParams<T> {
  code: { code: string }
}

export type TDtoConstructor<T = unknown> = new (...args: any[]) => T;

export type TDtoConstructorFactory<T extends any> = (config: IInfrastructureConfig) => TDtoConstructor<T>

export type TIconConstructor<T extends IconStore = IconStore> = new (...args: any[]) => T;

export type TCodeBuilder<
  TIcon extends IconStore = IconStore,
> = (params: IGeneratorParamsWithCode<TIcon>) => void;

export type TIconRenderer<TIcon extends IconStore = IconStore> = React.FC<{ icon: TIcon }>;

export const IconsContexts = [
  'action',
  'condition',
  'switch',
  'function',
  'system',
] as const;

export type TIconContext = typeof IconsContexts[number];

export type TIconConfig = {
  readonly alias: string
  transformer: IconTransformer
  /**
   * @deprecated
   */
  codeBuilder?: TCodeBuilder<any>
  context: TIconContext
  dontInsertCommonSkewerIcons?: boolean  
}

export type TIconsConfig = Record<string, TIconConfig>

export type TSchemeIconConfig<
  TConfig extends IInfrastructureConfig,
  TIconName extends keyof TConfig['icons']
> = TConfig['icons'][TIconName];

export const FileInfrastructureTypes = ['scheme', 'custom'] as const;
export type TFileInfrastructureType = typeof FileInfrastructureTypes[number];

export interface IFileInfrastructureType {
  readonly type: TFileInfrastructureType,
  readonly name: string;
}

export interface ISkewerGroupIconsItem {
  name: string
  icons: string[]
}

export interface IInfrastructureConfig extends IFileInfrastructureType {
  type: 'scheme';  
  readonly icons: TIconsConfig;
  readonly skewerIcons: readonly string[];
  readonly skewerIconsGroups?: ISkewerGroupIconsItem[];
  readonly outs?: OutTransformer;
  readonly codeExtension?: string;
  readonly language?: string;
  readonly generateCode?: (rootIcon: IconStore) => string;
}

export const emptyInfrastructureConfig: IInfrastructureConfig = {
  type: 'scheme',
  icons: {},
  name: '',
  skewerIcons: [],
}

export interface ICustomIntastructureConfig extends IFileInfrastructureType {
  type: 'custom';
  data: any;
}
