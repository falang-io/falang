import { getMindTreeRootIconConfig } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { SchemeHeaderBlockTransformer } from '../logic/blocks/scheme-header/SchemeHeader.block.transformer';
import { TextBlockTransformer } from '@falang/infrastructure-text';
import { EnumHeadBlockTransformer } from './blocks/enum_head/EnumHead.block.transformer';
import { EnumItemBlockTransformer } from './blocks/enum_item/EnumItem.block.transformer';

export const getLogicEnumsInfrastructureConfig = (): IInfrastructureConfig => {
  const blockTransformer = new SchemeHeaderBlockTransformer({
    titleLang: 'logic:enums'
  });
  const headerBlockTransformer = new TextBlockTransformer();
  const threadBlockTransformer = new EnumHeadBlockTransformer();
  const childBlockTransformer = new EnumItemBlockTransformer();

  return {
    name: 'enums',
    icons: {
      enums: getMindTreeRootIconConfig({
        alias: 'enums',
        blockTransformer,
        headerBlockTransformer,
        childBlockTransformer,
        threadBlockTransformer,
      })
    },
    type: 'scheme',
    skewerIcons: [],
  }
}
