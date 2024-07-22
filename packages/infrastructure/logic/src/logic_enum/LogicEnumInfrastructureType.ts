import { InfrastructureType } from '@falang/editor-scheme';
import { getLogicEnumsInfrastructureConfig } from './LogicEnumInfrastructure.config';

export class LogicEnumInfrastructureType extends InfrastructureType<ReturnType<typeof getLogicEnumsInfrastructureConfig>> {
  constructor() {
    super(getLogicEnumsInfrastructureConfig());
  }
}
