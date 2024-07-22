import { InfrastructureType } from '@falang/editor-scheme';
import { getLogicExternalApisInfrastructureConfig } from './LogicExternalApiInfrastructure.config';

export class LogicExternalApiInfrastructureType extends InfrastructureType<ReturnType<typeof getLogicExternalApisInfrastructureConfig>> {
  constructor() {
    super(getLogicExternalApisInfrastructureConfig());
  }
}
