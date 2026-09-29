import { getSwitchIconConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup } from '@falang/dto';
import { getChoiceNodeConfigs, type IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { choiceHeaderBlockConfig } from '../blocks/integration-choice/choice-header.block.config.js';
import { choiceOptionBlockConfig } from '../blocks/integration-choice/choice-option.block.config.js';

/**
 * One node kind per registered vendor's `IChoiceDescriptor` (e.g. `call-ai-choice`), modeled on
 * `switch` — mirrors `buildQuestionNodesIconsGroup` (same `getSwitchIconConfig` reuse for the
 * header+option shape/branch-line rendering). `choiceHeaderBlockConfig`/`choiceOptionBlockConfig`
 * are shared by every vendor's choice nodes — only the node *name* differs, resolved back to its
 * `IChoiceDescriptor` at render time via `IntegrationsRegistryStore.findChoice`.
 */
export const buildChoiceNodesIconsGroup = (integrations: readonly IWorkflowIntegration[]) => {
  const choices = integrations.flatMap((integration) => integration.choices ?? []);
  const nodeConfigs = getChoiceNodeConfigs(choices);
  const iconsConfig: Record<string, unknown> = {};
  for (const choice of choices) {
    Object.assign(
      iconsConfig,
      getSwitchIconConfig({
        name: choice.name,
        block: choiceHeaderBlockConfig,
        child: choiceOptionBlockConfig,
        title: choice.label,
      }),
    );
  }
  return new IconsGroup(
    new NodesGroup(nodeConfigs),
    iconsConfig as unknown as ConstructorParameters<typeof IconsGroup>[1],
  );
};
