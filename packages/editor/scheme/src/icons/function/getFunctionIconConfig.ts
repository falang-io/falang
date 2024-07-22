import { BlockTransformer } from '../../common/blocks/Block.transformer'
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { FunctionIconComponent } from './Function.icon.cmp'
import { FunctionIconDto } from './Function.icon.dto'
import { FunctionIconTransformer } from './Function.icon.transformer'

export interface IGetFunctionIconConfigParams {
  alias?: string
  blockTransformer: BlockTransformer<any, any>
  headerBlockTransformer?: BlockTransformer<any, any>
  footerBlockTransformer?: BlockTransformer<any, any>
  codeBuilder?: TCodeBuilder<any>
  fillBlockWidth?: boolean
}

export const getFunctionIconConfig = ({
  alias,
  blockTransformer,
  headerBlockTransformer,
  footerBlockTransformer,
  codeBuilder,
  fillBlockWidth,
}: IGetFunctionIconConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'function',
    context: 'function',
    transformer: new FunctionIconTransformer({
      alias: alias ?? 'function',
      blockTransformer,
      dtoConstructor: FunctionIconDto,
      footerBlockTransformer: footerBlockTransformer ?? blockTransformer,
      headerBlockTransformer: headerBlockTransformer ?? blockTransformer,
      fillBlockWidth,
    }),
    codeBuilder,    
  }
}