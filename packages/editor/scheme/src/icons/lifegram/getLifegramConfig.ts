import { BlockTransformer } from '../../common/blocks/Block.transformer'
import { OutTransformer } from '../../common/outs/Out.transformer'
import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { LifegramDto } from './Lifegram.dto'
import { LifegramTransformer } from './LifeGram.transformer'

interface IGetLifegramConfigParams {
  alias?: string
  finishBlockTransformer?: BlockTransformer<any, any>
  headerBlockTransformer?: BlockTransformer<any, any>
  returnBlockTransformer?: BlockTransformer<any, any>
  functionBlockTrnsformer?: BlockTransformer<any, any>
  finishStartBlockTransformer?: BlockTransformer<any, any>
  blockTransformer: BlockTransformer<any, any>
  switchOptionBlockTransformer?: BlockTransformer
  codeBuilder?: TCodeBuilder<any>
}

export const getLifegramConfig = (params: IGetLifegramConfigParams): TIconConfig => {
  return {
    alias: params.alias ?? 'lifegram',
    context: 'system',
    transformer: new LifegramTransformer({
      ...params,
      alias: params.alias ?? 'lifegram',
      dtoConstructor: LifegramDto,
    }),
    codeBuilder: params.codeBuilder,
  }
}