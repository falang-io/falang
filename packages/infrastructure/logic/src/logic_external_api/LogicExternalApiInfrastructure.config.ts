import { getMindTreeRootIconConfig } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { FunctionHeaderBlockTransformer } from '../logic/blocks/function-header/FunctionHeader.block.transformer';
import { SchemeHeaderBlockTransformer } from '../logic/blocks/scheme-header/SchemeHeader.block.transformer';
import { TextBlockTransformer } from '@falang/infrastructure-text';
import { LogicExternalApiHeadBlockTransformer } from './blocks/logic_external_api_head/LogicExternalApiHead.block.transformer';
import { LogicExternalApiItemBlockTransformer } from './blocks/logic_external_api_item/LogicExternalApiItem.block.transformer';

export const getLogicExternalApisInfrastructureConfig = (): IInfrastructureConfig => {
  const blockTransformer = new SchemeHeaderBlockTransformer({
    titleLang: 'logic:external_apis'
  });
  const headerBlockTransformer = new TextBlockTransformer();
  const threadBlockTransformer = new LogicExternalApiHeadBlockTransformer();
  const childBlockTransformer = new FunctionHeaderBlockTransformer();

  return {
    name: 'logic_external_apis',
    icons: {
      logic_external_apis: getMindTreeRootIconConfig({
        alias: 'logic_external_apis',
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
