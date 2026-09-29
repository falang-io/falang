import type { INode } from '@falang/dto';
import { EXTERNAL_API_STRUCTURE_NAME } from '@falang/typescript-dto';
import type {
  ExternalApiRegistryStore,
  IExternalApiRegistryApi,
  IExternalApiRegistryEndpoint,
} from '../typescript-project-service/external-api-registry.store.js';
import { externalApiStructureNodes } from '../external-api-structure/external-api-structure-scheme-factory.js';

/**
 * Indexes an `external-api-structure` document's named APIs (threads) and their endpoints
 * (children) into the project-wide `ExternalApiRegistryStore` — used by `call-api`'s picker.
 * `node` is the document's root `INode`; pass `undefined` for a document that hasn't been
 * opened/materialized yet (clears any stale entries for it). Callers are expected to only call
 * this for documents actually of type `external-api-structure`, and to remove the registry entry
 * themselves once a document stops being one (e.g. deleted, or retyped).
 */
export const updateExternalApiRegistryFromINode = (
  schemeId: string,
  schemeName: string,
  node: INode | undefined,
  registry: ExternalApiRegistryStore,
): void => {
  if (!node || !externalApiStructureNodes.is(node, EXTERNAL_API_STRUCTURE_NAME)) {
    registry.removeBySchemeId(schemeId);
    return;
  }

  const apis: IExternalApiRegistryApi[] = [];
  const endpoints: IExternalApiRegistryEndpoint[] = [];
  const [, body] = node.children;
  body.children.forEach((thread) => {
    const endpointIds: string[] = [];
    thread.children.forEach((item) => {
      endpointIds.push(item.id);
      endpoints.push({
        id: item.id,
        schemeId,
        schemeName,
        apiId: thread.id,
        apiName: thread.data.name,
        name: item.data.name,
        parameters: item.data.parameters,
        returnValue: item.data.returnValue,
      });
    });
    apis.push({ id: thread.id, schemeId, schemeName, name: thread.data.name, endpointIds });
  });
  registry.updateBySchemeId(schemeId, apis, endpoints);
};
