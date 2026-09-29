import { getSwitchIconConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup } from '@falang/dto';
import { getQuestionNodeConfigs, type IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { questionHeaderBlockConfig } from '../blocks/integration-question/question-header.block.config.js';
import { questionOptionBlockConfig } from '../blocks/integration-question/question-option.block.config.js';

/**
 * One node kind per registered vendor's `IQuestionDescriptor` (e.g. `telegram-question`), modeled on
 * `switch` — `getSwitchIconConfig` gives the header+option shape its branch-line rendering verbatim,
 * same recipe `buildIntegrationNodesIconsGroup`/`buildTriggerFunctionIconsGroup` already use for
 * their own node categories. `questionHeaderBlockConfig`/`questionOptionBlockConfig` are shared by
 * every vendor's question nodes — only the node *name* differs, resolved back to its
 * `IQuestionDescriptor` at render time via `IntegrationsRegistryStore.findQuestion`.
 */
export const buildQuestionNodesIconsGroup = (integrations: readonly IWorkflowIntegration[]) => {
  const questions = integrations.flatMap((integration) => integration.questions ?? []);
  const nodeConfigs = getQuestionNodeConfigs(questions);
  const iconsConfig: Record<string, unknown> = {};
  for (const question of questions) {
    Object.assign(
      iconsConfig,
      getSwitchIconConfig({
        name: question.name,
        block: questionHeaderBlockConfig,
        child: questionOptionBlockConfig,
        title: question.label,
      }),
    );
  }
  return new IconsGroup(
    new NodesGroup(nodeConfigs),
    iconsConfig as unknown as ConstructorParameters<typeof IconsGroup>[1],
  );
};
