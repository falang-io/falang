import type { INode } from '@falang/dto';
import type { functionBodyDto } from '@falang/typescript-dto';
import type { zod } from '@falang/dto';
import type { FunctionsRegistryStore } from '../typescript-project-service/functions-registry.store.js';

type IFunctionBodyData = zod.infer<typeof functionBodyDto>;

/**
 * Indexes a `function` document's declared parameters into the project-wide `FunctionsRegistryStore`
 * under `schemeId` — the id a `call-function` node's `schemeId` field targets. `node` is the
 * document's root `INode`; pass `undefined` for a function document that hasn't been opened/edited
 * yet (registers it with an empty parameter list, matching its not-yet-materialized default).
 * Callers are expected to only call this for documents actually of type `function`, and to remove
 * the registry entry themselves once a document stops being one (e.g. deleted, or retyped).
 */
export const updateFunctionsRegistryFromINode = (
  schemeId: string,
  schemeName: string,
  node: INode | undefined,
  registry: FunctionsRegistryStore,
): void => {
  const body = node?.children?.find((child) => child.name === 'function-body');
  const data = body?.data as IFunctionBodyData | undefined;
  registry.setFunction({
    schemeId,
    name: schemeName,
    parameters: data?.parameters ?? [],
    returnValue: data?.returnValue,
  });
};
