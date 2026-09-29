import type { TVariableInfo } from '@falang/typescript-dto';
import { action, makeObservable, ObservableMap } from 'mobx';
import type { IFunctionRegistryParameter } from './functions-registry.store.js';

export interface IExternalApiRegistryApi {
  /** Thread node id — one named API within an `external-api-structure` document. */
  readonly id: string;
  /** The owning `external-api-structure` document's id — what `call-api`'s `schemeId` targets. */
  readonly schemeId: string;
  readonly schemeName: string;
  readonly name: string;
  readonly endpointIds: readonly string[];
}

export interface IExternalApiRegistryEndpoint {
  /** Endpoint (child) node id, globally unique — what `call-api`'s `iconId` targets directly. */
  readonly id: string;
  readonly schemeId: string;
  readonly schemeName: string;
  readonly apiId: string;
  readonly apiName: string;
  readonly name: string;
  readonly parameters: readonly IFunctionRegistryParameter[];
  readonly returnValue?: TVariableInfo;
}

/**
 * Project-wide index of `external-api-structure` documents, used by `call-api`'s picker. Mirrors
 * `TypesRegistryStore`'s shape (entries pruned/replaced per owning document id) rather than
 * `FunctionsRegistryStore`'s flat one-entry-per-document shape, since one document can define
 * several named APIs (threads), each with several endpoints (children) — see
 * ADR 0019 (private).
 */
export class ExternalApiRegistryStore {
  readonly apis = new ObservableMap<string, IExternalApiRegistryApi>();
  readonly endpoints = new ObservableMap<string, IExternalApiRegistryEndpoint>();

  constructor() {
    makeObservable(this);
  }

  @action updateBySchemeId(
    schemeId: string,
    apis: readonly IExternalApiRegistryApi[],
    endpoints: readonly IExternalApiRegistryEndpoint[],
  ) {
    const currentApiIds: string[] = [];
    this.apis.forEach((value, key) => {
      if (value.schemeId === schemeId) currentApiIds.push(key);
    });
    const nextApiIds = new Set(apis.map((api) => api.id));
    currentApiIds.filter((id) => !nextApiIds.has(id)).forEach((id) => this.apis.delete(id));
    apis.forEach((api) => this.apis.set(api.id, api));

    const currentEndpointIds: string[] = [];
    this.endpoints.forEach((value, key) => {
      if (value.schemeId === schemeId) currentEndpointIds.push(key);
    });
    const nextEndpointIds = new Set(endpoints.map((endpoint) => endpoint.id));
    currentEndpointIds.filter((id) => !nextEndpointIds.has(id)).forEach((id) => this.endpoints.delete(id));
    endpoints.forEach((endpoint) => this.endpoints.set(endpoint.id, endpoint));
  }

  @action removeBySchemeId(schemeId: string) {
    this.updateBySchemeId(schemeId, [], []);
  }

  dispose() {
    this.apis.clear();
    this.endpoints.clear();
  }
}
