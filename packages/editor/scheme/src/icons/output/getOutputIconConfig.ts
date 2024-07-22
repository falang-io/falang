import { BlockTransformer } from '../../common/blocks/Block.transformer';
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig';
import { IconDto } from '../base/Icon.dto';
import { ISideIconTransformer } from '../side/ISideIconTransformer';
import { OutputIconComponent } from './Output.icon.cmp';
import { OutputTransformer } from './Output.transformer';

export interface IGetOutputIconConfigParams {
  alias?: string
  blockTransformer: BlockTransformer<any, any>
  codeBuilder?: TCodeBuilder<any>
  leftSideTransformer?: ISideIconTransformer,
}

export const getOutputIconConfig = ({ alias, blockTransformer, codeBuilder, leftSideTransformer }: IGetOutputIconConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'output',
    context: 'action',
    transformer: new OutputTransformer({
      alias: alias ?? 'output',
      blockTransformer,
      dtoConstructor: IconDto,
      leftSideTransformer: leftSideTransformer
    }),
    codeBuilder,
  }
}