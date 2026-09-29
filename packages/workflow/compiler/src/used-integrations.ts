import type { INode, IProjectDocument } from '@falang/dto';
import { ACTIVEPIECES_ACTION_NAME } from '@falang/workflow-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';

export interface IUsedIntegrations {
  /**
   * The subset of registered integrations at least one compiled document actually calls into — a
   * node whose name is one of the vendor's actions, questions or choices. Only these contribute
   * activity code (`sharedActivityCode` and every descriptor's activity code) and activity proxies
   * to the compiled output. Binding a trigger alone doesn't count: a trigger-function's preamble
   * waits on a signal or reads its start arguments, it never calls a vendor activity.
   */
  readonly integrations: readonly IWorkflowIntegration[];
  /** Whether any compiled document has an `activepieces-action` node — gates `runActivepiecesAction`. */
  readonly usesActivepiecesAction: boolean;
}

const collectNodeNames = (node: INode, names: Set<string>): void => {
  names.add(node.name);
  for (const child of node.children ?? []) collectNodeNames(child, names);
  for (const mod of node.mods ?? []) collectNodeNames(mod, names);
  if (node.out) collectNodeNames(node.out, names);
};

const integrationNodeNames = (integration: IWorkflowIntegration): readonly string[] => [
  ...integration.actions.map((action) => action.name),
  ...(integration.questions ?? []).map((question) => question.name),
  ...(integration.choices ?? []).map((choice) => choice.name),
];

/**
 * Scans the documents `compileProject` compiles (their whole node trees, `out`/`mods` included) and
 * keeps only the integrations they use, preserving the registration order so the compiled output
 * stays deterministic. A whole vendor is kept or dropped — not individual descriptors — since a
 * vendor's `sharedActivityCode` and its descriptors' activity code are written as one unit and may
 * reference each other's helpers.
 */
export const selectUsedIntegrations = (
  documents: readonly IProjectDocument[],
  integrations: readonly IWorkflowIntegration[],
): IUsedIntegrations => {
  const names = new Set<string>();
  for (const document of documents) {
    if (document.root) collectNodeNames(document.root, names);
  }
  return {
    integrations: integrations.filter((integration) =>
      integrationNodeNames(integration).some((name) => names.has(name)),
    ),
    usesActivepiecesAction: names.has(ACTIVEPIECES_ACTION_NAME),
  };
};
