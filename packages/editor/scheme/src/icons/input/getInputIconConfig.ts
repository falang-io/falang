import { BlockTransformer } from '../../common/blocks/Block.transformer';
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig';
import { IconDto } from '../base/Icon.dto';
import { ISideIconTransformer } from '../side/ISideIconTransformer';
import { InputIconComponent } from './Input.icon.cmp';
import { InputTransformer } from './Input.transformer';

export interface IGetInputIconConfigParams {
  alias?: string
  blockTransformer: BlockTransformer<any, any>
  codeBuilder?: TCodeBuilder<any>
  leftSideTransformer?: ISideIconTransformer,
}

export const getInputIconConfig = ({ alias, blockTransformer, codeBuilder, leftSideTransformer }: IGetInputIconConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'input',
    context: 'action',
    transformer: new InputTransformer({
      alias: alias ?? 'input',
      blockTransformer,
      dtoConstructor: IconDto,
      leftSideTransformer: leftSideTransformer
    }),
    codeBuilder,
  }
}