import type { IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { EXTERNAL_API_STRUCTURE_NAME } from '@falang/typescript-dto';
import type { IFunctionBodyParameter } from './function-signature.js';

export interface IExternalApiEndpoint {
  readonly apiId: string;
  readonly apiName: string;
  readonly name: string;
  readonly parameters: readonly IFunctionBodyParameter[];
  readonly returnValue?: TVariableInfo;
  /**
   * The owning `external-api-structure` document's own id/name — e.g. `GameApi` for a `<ApiDoc>` in
   * the `<ApiDoc>_<Group>_<Endpoint>` naming `compileRustProject` uses for its flattened `Apis` trait
   * (see ADR 0019 (private)'s "Rust target — old-app layout" implementation notes) and `compileTsProject`
   * uses for its own per-document `<ApiDoc>` interface (see ADR 0019 (private)'s TS-target
   * implementation notes). cpp/Go/C# don't read this at all — each already gets its own interface/trait
   * keyed by `apiName` alone — but it's always populated by `buildExternalApiRegistry`, the only real
   * production code that constructs one of these, so it stays required rather than optional.
   */
  readonly documentId: string;
  readonly documentName: string;
}

export interface IExternalApi {
  readonly name: string;
  readonly endpointIds: readonly string[];
  readonly documentId: string;
  readonly documentName: string;
}

export interface IExternalApiRegistry {
  /** api (thread node) id -> API definition, for emitting one interface/trait/class per API. */
  readonly apis: ReadonlyMap<string, IExternalApi>;
  /** endpoint (child node) id -> endpoint definition, the shape a `call-api` node's `iconId` resolves against. */
  readonly endpoints: ReadonlyMap<string, IExternalApiEndpoint>;
}

interface IExternalApiHeadData {
  readonly name: string;
}

interface IExternalApiItemData {
  readonly name: string;
  readonly parameters: readonly IFunctionBodyParameter[];
  readonly returnValue?: TVariableInfo;
}

/**
 * Walks every `external-api-structure` document's threads (one per named API — see `mindTreeCfg`'s
 * root/header/body/thread/child shape, same as `buildStructRegistry`'s own walk of
 * `objects-structure`) into a project-wide registry of API endpoints. A `call-api` node's `iconId`
 * is the endpoint (child) node's own id, globally unique the same way a struct thread's id is.
 */
export const buildExternalApiRegistry = (documents: readonly IProjectDocument[]): IExternalApiRegistry => {
  const apis = new Map<string, IExternalApi>();
  const endpoints = new Map<string, IExternalApiEndpoint>();

  for (const document of documents) {
    if (document.type !== EXTERNAL_API_STRUCTURE_NAME || !document.root) continue;
    const [, body] = document.root.children ?? [];
    for (const apiThread of body?.children ?? []) {
      const apiData = apiThread.data as IExternalApiHeadData;
      const endpointIds: string[] = [];
      for (const item of apiThread.children ?? []) {
        const itemData = item.data as IExternalApiItemData;
        endpoints.set(item.id, {
          apiId: apiThread.id,
          apiName: apiData.name,
          name: itemData.name,
          parameters: itemData.parameters,
          returnValue: itemData.returnValue,
          documentId: document.id,
          documentName: document.name,
        });
        endpointIds.push(item.id);
      }
      apis.set(apiThread.id, { name: apiData.name, endpointIds, documentId: document.id, documentName: document.name });
    }
  }

  return { apis, endpoints };
};
