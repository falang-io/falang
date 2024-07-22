import { BlockTransformer } from '../../common/blocks/Block.transformer'
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto'
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { WhileTransformer } from './While.transformer'

export interface IGetWhileConfigParams {
  alias?: string
  blockTransformer: BlockTransformer<any, any>
  codeBuilder?: TCodeBuilder<any>
}

export const getWhileConfig = ({ alias, blockTransformer, codeBuilder }: IGetWhileConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'while',
    context: 'action',
    transformer: new WhileTransformer({
      alias: alias ?? 'while',
      blockTransformer,
      dtoConstructor: IconWithSkewerDto,
    }),
    codeBuilder,
  };
};
