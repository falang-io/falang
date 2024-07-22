import { EmptyBlockTransformer } from '../../common/blocks/Block.transformer'
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto'
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { PseudoCycleIconTransformer } from './PseudoCycle.icon.transformer';

export interface IGetPseudoCycleConfigParams {
  alias?: string
  codeBuilder?: TCodeBuilder<any>
}

export const getPseudoCycleConfig = ({ alias, codeBuilder }: IGetPseudoCycleConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'pseudo-cycle',
    context: 'action',
    transformer: new PseudoCycleIconTransformer({
      alias: alias ?? 'pseudo-cycle',
      blockTransformer: new EmptyBlockTransformer(''),
      dtoConstructor: IconWithSkewerDto,
    }),
    codeBuilder,
  };
};
