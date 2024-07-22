import { InfrastructureType } from '@falang/editor-scheme';
import { getLogicObjectsInfrastructureConfig } from './LogicObjectsInfrastructure.config';

export class LogicObjectsInfrastructureType extends InfrastructureType<ReturnType<typeof getLogicObjectsInfrastructureConfig>> {
  constructor() {
    super(getLogicObjectsInfrastructureConfig());
  }
}
