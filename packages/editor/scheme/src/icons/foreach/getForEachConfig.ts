import { BlockTransformer } from '../../common/blocks/Block.transformer'
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto'
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { ForEachTransformer } from './Foreach.icon.transformer'

export interface IGetForEachConfigParams {
  alias?: string
  blockTransformer: BlockTransformer<any, any>
  codeBuilder?: TCodeBuilder<any>
}

export const getForEachConfig = ({ alias, blockTransformer, codeBuilder }: IGetForEachConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'foreach',
    context: 'action',
    transformer: new ForEachTransformer({
      alias: alias ?? 'foreach',
      blockTransformer,
      dtoConstructor: IconWithSkewerDto,
    }),
    codeBuilder,
  };
};
