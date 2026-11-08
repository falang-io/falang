import type { INode } from '@falang/dto';
import { updateFunctionsRegistryFromINode, type FunctionsRegistryStore } from '@falang/typescript-scheme';

/** The slice of a workflow document the functions registry is built from. */
export interface IFunctionRegistryDocument {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly data?: INode;
}

/**
 * Makes the project-wide functions registry — what `call-function`'s target picker and parameter fields read — list
 * exactly the project's `function` documents, opened in a tab or not; a document never edited yet (no stored tree) is
 * listed with no parameters. The desktop IDEs do the same through `@falang/desktop-agent-host`'s `syncFunctionsRegistry`.
 */
export const syncWorkflowFunctionsRegistry = (
  registry: FunctionsRegistryStore,
  documents: readonly IFunctionRegistryDocument[],
): void => {
  const functionDocs = documents.filter((doc) => doc.type === 'function');
  const ids = new Set(functionDocs.map((doc) => doc.id));
  for (const id of Array.from(registry.functions.keys())) {
    if (!ids.has(id)) registry.removeFunction(id);
  }
  for (const doc of functionDocs) updateFunctionsRegistryFromINode(doc.id, doc.name, doc.data, registry);
};
