import { BlockTransformer } from '../../common/blocks/Block.transformer'
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { ISideIconTransformer } from '../side/ISideIconTransformer';
import { MindTreeRootIconTransformer } from './MindTreeRoot.icon.transformer';
import { MindTreeChildIconTransformer } from './MindTreeChild.icon.transformer';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { MindTreeThreadIconTransformer } from './MindTreeThread.icon.transformer';
import { ThreadsDto } from '../../common/threads/Threads.dto';
import { MindTreeRootIconDto } from './MindThreeRoot.icon.dto';

export interface IGetMindTreeRootIconConfigParams {
  alias: string,
  blockTransformer: BlockTransformer<any, any>
  headerBlockTransformer: BlockTransformer<any, any>
  threadBlockTransformer: BlockTransformer<any, any>
  childBlockTransformer: BlockTransformer<any, any>
  codeBuilder?: TCodeBuilder<any>
  leftSideTransformer?: ISideIconTransformer
  allowChild?: boolean
}

export const getMindTreeRootIconConfig = ({ 
  alias,
  blockTransformer,
  codeBuilder,
  leftSideTransformer ,
  threadBlockTransformer,
  childBlockTransformer,
  headerBlockTransformer,
  allowChild,
}: IGetMindTreeRootIconConfigParams): TIconConfig => {
  const childTransformer = new MindTreeChildIconTransformer({
    dtoConstructor: IconWithSkewerDto,
    alias: 'system',
    blockTransformer: childBlockTransformer,
    allowChild: !!allowChild, 
  });
  const threadTransformer = new MindTreeThreadIconTransformer({
    dtoConstructor: IconWithSkewerDto,
    alias: 'system',
    blockTransformer: threadBlockTransformer,
    childTransformer,
  })
  return {
    alias,
    context: 'system',
    transformer: new MindTreeRootIconTransformer({
      alias,
      blockTransformer,
      dtoConstructor: MindTreeRootIconDto,
      leftSideTransformer,
      threadTransformer,
      headerBlockTransformer,
    }),
    codeBuilder,
  };
};
