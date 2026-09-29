import type { ISchemeFactoryParams } from '@falang/scheme';
import {
  schemeFactory,
  MouseNavigationModule,
  SchemeInfrastructure,
  EditorModule,
  ValencePointsModule,
  ContextMenuModule,
  type IModule,
  IconsGroup,
  getMindTreeIconConfig,
  IconsTransferModule,
  BlockResizeModule,
} from '@falang/scheme';
import { enumStructureNodes, ENUM_STRUCTURE_NAME } from '@falang/typescript-dto';
import { textBlockConfig } from '../blocks/text/text-block.config.js';
import { AntContextMenuModule, AntModsSelectorModule } from '@falang/antd';
import type { DependencyContainer } from '@falang/di';
import { TypescriptEnumStructureModule } from './enum-structure.module.js';
import { enumHeadBlockConfig } from '../blocks/enum-head/enum-head.block.config.js';
import { enumItemBlockConfig } from '../blocks/enum-item/enum-item.block.config.js';
import { schemeTitleBlockConfig } from '../blocks/scheme-title/scheme-title-block.config.js';

export { enumStructureNodes };

const getEnumStructureInfrastructure = () => {
  const block = textBlockConfig;

  const iconsGroup = new IconsGroup(enumStructureNodes, {
    ...getMindTreeIconConfig({
      name: ENUM_STRUCTURE_NAME,
      header: block,
      body: schemeTitleBlockConfig,
      thread: enumHeadBlockConfig,
      child: enumItemBlockConfig,
    }),
  });

  return new SchemeInfrastructure([iconsGroup]);
};

export const enumStructureInfrastructure = getEnumStructureInfrastructure();

export interface IEnumStructureSchemeFactoryParams extends Omit<ISchemeFactoryParams, 'infra'> {
  parentContainer: DependencyContainer;
  extraModules?: IModule[];
}

export const enumStructureSchemeFactory = ({
  parentContainer,
  extraModules,
  ...props
}: IEnumStructureSchemeFactoryParams) => {
  const scheme = schemeFactory({
    ...props,
    infra: enumStructureInfrastructure,
    modules: [
      new MouseNavigationModule(),
      new EditorModule(),
      new ValencePointsModule(),
      new ContextMenuModule(),
      new AntContextMenuModule(),
      new AntModsSelectorModule(),
      new IconsTransferModule(),
      new BlockResizeModule(),
      new TypescriptEnumStructureModule(),
      ...(extraModules ?? []),
    ],
    parentContainer,
  });
  return scheme;
};
