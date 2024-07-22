import { getMindTreeRootIconConfig } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { TextBlockTransformer } from '@falang/infrastructure-text';
import { ObjectDefinitionBlockTransformer } from './blocks/definition/ObjectDefinition.block.transformer';
import { LogicObjectBlockStore } from './blocks/logic_block/LogicObject.block.store';
import { LogicObjectNameBlockStore } from './blocks/object_name/LogicObjectName.block.store';

export const getLogicObjectsInfrastructureConfig = (): IInfrastructureConfig => {
  const blockTransformer = new TextBlockTransformer({ Constructor: LogicObjectBlockStore });
  const headerBlockTransformer = new TextBlockTransformer();
  const threadBlockTransformer = new TextBlockTransformer({ Constructor: LogicObjectNameBlockStore });
  const childBlockTransformer = new ObjectDefinitionBlockTransformer();

  return {
    name: 'logic_objects',
    icons: {
      tree: getMindTreeRootIconConfig({
        alias: 'tree',
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
