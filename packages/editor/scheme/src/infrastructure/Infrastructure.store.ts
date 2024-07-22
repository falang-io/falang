import { SchemeStore } from '../store/Scheme.store';

export interface IInfrastructureStoreParams {
  scheme: SchemeStore
}

export class InfrastructureStore {
  scheme: SchemeStore
  constructor(params: IInfrastructureStoreParams) {
    this.scheme = params.scheme;
  }

  dispose() {
    
  }
}