import { BlockTransformer } from '../../common/blocks/Block.transformer';
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig';
import { IconDto } from '../base/Icon.dto';
import { ISideIconTransformer } from '../side/ISideIconTransformer';
import { ActionIconComponent } from './Action.icon.cmp';
import { ActionTransformer } from './Action.transformer';

export interface IGetActionIconConfigParams {
  alias?: string
  blockTransformer: BlockTransformer<any, any>
  codeBuilder?: TCodeBuilder<any>
  leftSideTransformer?: ISideIconTransformer,
}

export const getActionIconConfig = ({ alias, blockTransformer, codeBuilder, leftSideTransformer }: IGetActionIconConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'action',
    context: 'action',
    transformer: new ActionTransformer({
      alias: alias ?? 'action',
      blockTransformer,
      dtoConstructor: IconDto,
      leftSideTransformer: leftSideTransformer
    }),
    codeBuilder,
  }
}