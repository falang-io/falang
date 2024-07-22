import { BlockTransformer } from '../../common/blocks/Block.transformer'
import { OutTransformer } from '../../common/outs/Out.transformer';
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { IfIconComponent } from './If.icon.cmp';
import { IfIconDto } from './If.icon.dto';
import { IfIconTransformer } from './If.icon.transformer';
import { ISideIconTransformer } from '../side/ISideIconTransformer';

export interface IGetIfIconConfigParams {
  alias?: string,
  blockTransformer: BlockTransformer<any, any>
  outTransformer: OutTransformer
  codeBuilder?: TCodeBuilder<any>
  leftSideTransformer?: ISideIconTransformer
}

export const getIfIconConfig = ({ alias, blockTransformer, outTransformer, codeBuilder, leftSideTransformer }: IGetIfIconConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'if',
    context: 'condition',
    transformer: new IfIconTransformer({
      alias: alias ?? 'if',
      blockTransformer,
      dtoConstructor: IfIconDto,
      outTransformer,
      leftSideTransformer,
    }),
    codeBuilder,
  };
};
