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
import { objectStructureNodes } from '@falang/typescript-dto';
import { textBlockConfig } from '../blocks/text/text-block.config.js';
import { AntContextMenuModule, AntModsSelectorModule } from '@falang/antd';
import type { DependencyContainer } from '@falang/di';
import { TypescriptObjectsStructureModule } from './objects-structure.module.js';
import { objectPropertyBlockConfig } from '../blocks/object-property/object-property.config.js';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { schemeTitleBlockConfig } from '../blocks/scheme-title/scheme-title-block.config.js';

export { objectStructureNodes };

const getObjectsStrctureInfrastructure = () => {
  const block = textBlockConfig;

  const iconsGroup = new IconsGroup(objectStructureNodes, {
    ...getMindTreeIconConfig({
      name: OBJECTS_STRUCTURE_NAME,
      header: block,
      body: schemeTitleBlockConfig,
      thread: block,
      child: objectPropertyBlockConfig,
    }),
  });

  return new SchemeInfrastructure([iconsGroup]);
};

export const objectsStructureInfrastructure = getObjectsStrctureInfrastructure();

export interface IObjectsStructureSchemeFactoryParams extends Omit<ISchemeFactoryParams, 'infra'> {
  parentContainer: DependencyContainer;
  extraModules?: IModule[];
}

export const objectsStructureSchemeFactory = ({
  parentContainer,
  extraModules,
  ...props
}: IObjectsStructureSchemeFactoryParams) => {
  const scheme = schemeFactory({
    ...props,
    infra: objectsStructureInfrastructure,
    modules: [
      new MouseNavigationModule(),
      new EditorModule(),
      new ValencePointsModule(),
      new ContextMenuModule(),
      new AntContextMenuModule(),
      new AntModsSelectorModule(),
      new IconsTransferModule(),
      new BlockResizeModule(),
      new TypescriptObjectsStructureModule(),
      ...(extraModules ?? []),
    ],
    parentContainer,
  });
  return scheme;
};
