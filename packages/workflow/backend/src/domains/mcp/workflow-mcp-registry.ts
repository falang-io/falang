import { NodesGroup, NodesStack } from '@falang/dto';
import { createDefaultDocumentStackRegistry, type DocumentStackRegistry } from '@falang/mcp-core';
import { functionNodesGroup } from '@falang/typescript-dto';
import {
  activepiecesActionNodesGroup,
  magicNodesGroup,
  triggerFunctionNodesGroup,
  TRIGGER_FUNCTION_NAME,
} from '@falang/workflow-dto';
import {
  getChoiceNodeConfigs,
  getIntegrationNodeConfigs,
  getQuestionNodeConfigs,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';

/**
 * `@falang/mcp-core`'s `createDefaultDocumentStackRegistry()` only registers the workflow product's
 * `function`/`trigger-function` document types with `functionNodesGroup` + `triggerFunctionNodesGroup`
 * + the generic `activepiecesActionNodesGroup` — no per-vendor node kind (see that package's README,
 * "What isn't registered here"). This backend host is exactly the one place that has a runtime vendor
 * catalog (`registered-integrations.ts`'s statically-registered vendors), so it layers
 * `getIntegrationNodeConfigs`/`getQuestionNodeConfigs`/`getChoiceNodeConfigs` on top of that base
 * registration — see ADR 0029 (private)'s phase A implementation notes,
 * "the `backend` host (phase F) layers … on top".
 *
 * Deliberately built from the *static* `REGISTERED_INTEGRATIONS` list only, not
 * `ActivepiecesCatalogService.getDynamicIntegrations()` — dynamic ActivePieces pieces all compile
 * down to the single generic `activepieces-action` node kind (already covered by
 * `activepiecesActionNodesGroup`), never a per-action node kind of their own; this mirrors
 * `@falang/workflow-client-common`'s own `buildIntegrationNodesIconsGroup(REGISTERED_INTEGRATIONS)`
 * call in `workflow-store.ts`, which the editor itself uses to build the exact same per-vendor node
 * kinds a real document can contain.
 */
export const buildWorkflowMcpRegistry = (integrations: readonly IWorkflowIntegration[]): DocumentStackRegistry => {
  const registry = createDefaultDocumentStackRegistry();

  const questions = integrations.flatMap((integration) => integration.questions ?? []);
  const choices = integrations.flatMap((integration) => integration.choices ?? []);

  const stack = new NodesStack([
    functionNodesGroup,
    new NodesGroup(triggerFunctionNodesGroup),
    new NodesGroup(magicNodesGroup),
    new NodesGroup(activepiecesActionNodesGroup),
    new NodesGroup(getIntegrationNodeConfigs(integrations)),
    new NodesGroup(getQuestionNodeConfigs(questions)),
    new NodesGroup(getChoiceNodeConfigs(choices)),
  ]);

  registry.registerProjectType('workflow', {
    function: { rootNodeName: 'function', stack },
    [TRIGGER_FUNCTION_NAME]: { rootNodeName: TRIGGER_FUNCTION_NAME, stack },
  });

  return registry;
};
