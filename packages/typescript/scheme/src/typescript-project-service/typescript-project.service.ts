import { action, makeObservable, observable } from 'mobx';
import { TypesRegistryStore } from './types-registry.store.js';
import { FunctionsRegistryStore } from './functions-registry.store.js';
import { ExternalApiRegistryStore } from './external-api-registry.store.js';

export type TCodeTheme = 'light' | 'dark';

export class TypescriptProjectService {
  readonly typesRegistry = new TypesRegistryStore();
  readonly functionsRegistry = new FunctionsRegistryStore();
  readonly externalApiRegistry = new ExternalApiRegistryStore();
  @observable theme: TCodeTheme = 'dark';

  constructor() {
    makeObservable(this);
  }

  @action setTheme(theme: TCodeTheme) {
    this.theme = theme;
  }

  dispose() {
    this.typesRegistry.dispose();
    this.functionsRegistry.dispose();
    this.externalApiRegistry.dispose();
  }
}
