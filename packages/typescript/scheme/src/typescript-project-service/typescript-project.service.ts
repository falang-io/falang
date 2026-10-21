import { action, makeObservable, observable } from 'mobx';
import type { TFloatType } from '@falang/typescript-dto';
import { TypesRegistryStore } from './types-registry.store.js';
import { FunctionsRegistryStore } from './functions-registry.store.js';
import { ExternalApiRegistryStore } from './external-api-registry.store.js';

export type TCodeTheme = 'light' | 'dark';

/** `typescript`: one `number` option (the workflow product); `portable`: integer/float/decimal (C++/Arduino/logic targets, ADR 0069). */
export type TNumberTypesMode = 'typescript' | 'portable';

export class TypescriptProjectService {
  readonly typesRegistry = new TypesRegistryStore();
  readonly functionsRegistry = new FunctionsRegistryStore();
  readonly externalApiRegistry = new ExternalApiRegistryStore();
  @observable theme: TCodeTheme = 'dark';
  @observable numberTypesMode: TNumberTypesMode = 'typescript';
  @observable defaultFloatType: TFloatType = 'float64';

  constructor() {
    makeObservable(this);
  }

  @action setTheme(theme: TCodeTheme) {
    this.theme = theme;
  }

  @action setNumberTypesMode(mode: TNumberTypesMode) {
    this.numberTypesMode = mode;
  }

  @action setDefaultFloatType(type: TFloatType) {
    this.defaultFloatType = type;
  }

  dispose() {
    this.typesRegistry.dispose();
    this.functionsRegistry.dispose();
    this.externalApiRegistry.dispose();
  }
}
