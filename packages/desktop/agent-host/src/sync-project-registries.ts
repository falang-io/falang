import type { DependencyContainer } from '@falang/di';
import { resolveService } from '@falang/di';
import type { INode } from '@falang/dto';
import {
  TOKEN_TYPESCRIPT_PROJECT_SERVICE,
  updateExternalApiRegistryFromINode,
  updateFunctionsRegistryFromINode,
  updateTypesRegistryFromINode,
} from '@falang/typescript-scheme';

/** The slice of a project document the project-wide registry syncs read. */
export interface IProjectRegistryDocument {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly root?: INode;
}

/**
 * Keeps the project-wide function registry (used by `call-function`'s parameter fields) in sync with every `function`
 * document, including ones never opened in a tab. Both desktop IDEs run it from an autorun over their documents.
 */
export const syncFunctionsRegistry = (
  container: DependencyContainer,
  snapshot: readonly IProjectRegistryDocument[],
): void => {
  const functionsRegistry = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, container).functionsRegistry;
  const functionDocs = snapshot.filter((doc) => doc.type === 'function');
  const validIds = new Set(functionDocs.map((doc) => doc.id));
  Array.from(functionsRegistry.functions.keys())
    .filter((id) => !validIds.has(id))
    .forEach((id) => functionsRegistry.removeFunction(id));
  functionDocs.forEach((doc) => updateFunctionsRegistryFromINode(doc.id, doc.name, doc.root, functionsRegistry));
};

/**
 * Keeps the project-wide external-API registry (used by `call-api`'s scheme/endpoint pickers and its per-parameter Monaco
 * cells) in sync with every `external-api-structure` document, including ones never opened in a tab (`app-sketch` only).
 */
export const syncExternalApiRegistry = (
  container: DependencyContainer,
  snapshot: readonly IProjectRegistryDocument[],
): void => {
  const externalApiRegistry = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, container).externalApiRegistry;
  const apiDocs = snapshot.filter((doc) => doc.type === 'external-api-structure');
  const validSchemeIds = new Set(apiDocs.map((doc) => doc.id));
  const staleSchemeIds = new Set<string>();
  externalApiRegistry.apis.forEach((api) => {
    if (!validSchemeIds.has(api.schemeId)) staleSchemeIds.add(api.schemeId);
  });
  staleSchemeIds.forEach((schemeId) => externalApiRegistry.removeBySchemeId(schemeId));
  apiDocs.forEach((doc) => updateExternalApiRegistryFromINode(doc.id, doc.name, doc.root, externalApiRegistry));
};

/**
 * Keeps the project-wide struct-type registry (used anywhere a struct type's human name is shown, e.g. `create-var`/
 * `object-property` type pickers) in sync with every `objects-structure` document, including ones never opened in a tab
 * (`app-sketch` only). Without it a struct referenced from a document whose defining document was never opened rendered
 * as a raw id instead of its name.
 */
export const syncTypesRegistry = (
  container: DependencyContainer,
  snapshot: readonly IProjectRegistryDocument[],
): void => {
  const typesRegistry = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, container).typesRegistry;
  const structureDocs = snapshot.filter(
    (doc): doc is IProjectRegistryDocument & { root: INode } => doc.type === 'objects-structure' && Boolean(doc.root),
  );
  // `updateTypesRegistryFromINode` keys registry entries by the *root node's own* `id` (`node.id`), not the owning
  // document's id — staleness has to be computed against that same key space; comparing against `doc.id` instead never
  // matches anything real and drove `updateTypesByParent` into a read-then-write-the-same-observable loop each time a
  // document was deleted, which MobX caught as a non-converging autorun after 100 iterations.
  const validParentIds = new Set(structureDocs.map((doc) => doc.root.id));
  const parentIds = new Set<string>();
  typesRegistry.types.forEach((item) => parentIds.add(item.parentId));
  Array.from(parentIds)
    .filter((parentId) => !validParentIds.has(parentId))
    .forEach((parentId) => typesRegistry.updateTypesByParent(parentId, []));
  structureDocs.forEach((doc) => updateTypesRegistryFromINode(doc.root, typesRegistry));
};

/** All three project-wide syncs at once — the headless equivalent of the sketch editor's three autoruns. */
export const syncSketchProjectRegistries = (
  container: DependencyContainer,
  snapshot: readonly IProjectRegistryDocument[],
): void => {
  syncFunctionsRegistry(container, snapshot);
  syncExternalApiRegistry(container, snapshot);
  syncTypesRegistry(container, snapshot);
};
