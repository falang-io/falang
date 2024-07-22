import { TCodeBuilder, TIconConfig } from '../../infrastructure/IInfrastructureConfig'
import { ParallelIconComponent } from './Paralle.icon.cmp'
import { ParallelIconTransformer } from './Parallel.icon.transformer'

export interface IGetParallelIconConfigParams {
  alias?: string
  codeBuilder?: TCodeBuilder<any>
}

export const getParallelIconConfig = ({ alias, codeBuilder }: IGetParallelIconConfigParams): TIconConfig => {
  return {
    alias: alias ?? 'parallel',
    context: 'condition',
    transformer: new ParallelIconTransformer({
      alias: alias ?? 'parallel',
    }),
    codeBuilder,
  }
}