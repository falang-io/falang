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
import { externalApiStructureNodes, EXTERNAL_API_STRUCTURE_NAME } from '@falang/typescript-dto';
import { textBlockConfig } from '../blocks/text/text-block.config.js';
import { AntContextMenuModule, AntModsSelectorModule } from '@falang/antd';
import type { DependencyContainer } from '@falang/di';
import { TypescriptExternalApiStructureModule } from './external-api-structure.module.js';
import { externalApiItemBlockConfig } from '../blocks/external-api-item/external-api-item.block.config.js';
import { externalApiHeadBlockConfig } from '../blocks/external-api-head/external-api-head.block.config.js';
import { schemeTitleBlockConfig } from '../blocks/scheme-title/scheme-title-block.config.js';

export { externalApiStructureNodes };

const getExternalApiStructureInfrastructure = () => {
  const block = textBlockConfig;

  const iconsGroup = new IconsGroup(externalApiStructureNodes, {
    ...getMindTreeIconConfig({
      name: EXTERNAL_API_STRUCTURE_NAME,
      header: block,
      body: schemeTitleBlockConfig,
      thread: externalApiHeadBlockConfig,
      child: externalApiItemBlockConfig,
    }),
  });

  return new SchemeInfrastructure([iconsGroup]);
};

export const externalApiStructureInfrastructure = getExternalApiStructureInfrastructure();

export interface IExternalApiStructureSchemeFactoryParams extends Omit<ISchemeFactoryParams, 'infra'> {
  parentContainer: DependencyContainer;
  extraModules?: IModule[];
}

export const externalApiStructureSchemeFactory = ({
  parentContainer,
  extraModules,
  ...props
}: IExternalApiStructureSchemeFactoryParams) => {
  const scheme = schemeFactory({
    ...props,
    infra: externalApiStructureInfrastructure,
    modules: [
      new MouseNavigationModule(),
      new EditorModule(),
      new ValencePointsModule(),
      new ContextMenuModule(),
      new AntContextMenuModule(),
      new AntModsSelectorModule(),
      new IconsTransferModule(),
      new BlockResizeModule(),
      new TypescriptExternalApiStructureModule(),
      ...(extraModules ?? []),
    ],
    parentContainer,
  });
  return scheme;
};
