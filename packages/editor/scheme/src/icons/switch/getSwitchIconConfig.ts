import { BlockTransformer } from '../../common/blocks/Block.transformer'
import { OutTransformer } from '../../common/outs/Out.transformer'
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { SwitchComponent } from './Switch.cmp'
import { SwitchDto } from './Switch.dto'
import { SwitchTransformer } from './Switch.transformer'
import { SwitchOptionDto } from './SwitchOption.dto'
import { SwitchOptionTransformer } from './SwitchOption.transformer'
import { ISideIconTransformer } from '../side/ISideIconTransformer'

export interface IGetSwitchIconConfigParams {
  alias?: string
  blockTransformer: BlockTransformer<any, any>
  switchOptionBlockTransformer?: BlockTransformer<any, any>
  outTransformer: OutTransformer
  codeBuilder?: TCodeBuilder<any>
  leftSideTransformer?: ISideIconTransformer
}

export const getSwitchIconConfig = ({ alias, blockTransformer, switchOptionBlockTransformer, outTransformer, codeBuilder, leftSideTransformer }: IGetSwitchIconConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'switch',
    context: 'condition',
    transformer: new SwitchTransformer({
      alias: alias ?? 'switch',
      blockTransformer,
      dtoConstructor: SwitchDto,
      leftSideTransformer,
      switchOptionTransformer: new SwitchOptionTransformer({
        alias: 'system',
        blockTransformer: switchOptionBlockTransformer ?? blockTransformer,
        dtoConstructor: SwitchOptionDto,
        outTransformer,
      })
    }),
    codeBuilder,
  }
}