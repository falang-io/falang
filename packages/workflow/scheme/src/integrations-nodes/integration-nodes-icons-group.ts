import { getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup } from '@falang/dto';
import { getIntegrationNodeConfigs, type IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { integrationActionBlockConfig } from '../blocks/integration-action/integration-action.block.config.js';
import { integrationTriggerBlockConfig } from '../blocks/integration-trigger/integration-trigger.block.config.js';

/**
 * One node kind per registered vendor's action/trigger (e.g. `telegram-send-message`,
 * `telegram-trigger`) — see ADR 0006's "generic field-driven nodes" section. `integrationActionBlockConfig`
 * / `integrationTriggerBlockConfig` are shared by every vendor's nodes of that category; only the node
 * *name* (and its `title`, taken from the descriptor's `label`) differs per node.
 */
export const buildIntegrationNodesIconsGroup = (integrations: readonly IWorkflowIntegration[]) => {
  const nodeConfigs = getIntegrationNodeConfigs(integrations);
  const entries = integrations.flatMap((integration) => [
    ...integration.triggers.map(
      (trigger) => [trigger.name, getSimpleIconNodeConfig(integrationTriggerBlockConfig, trigger.label)] as const,
    ),
    ...integration.actions.map(
      (action) => [action.name, getSimpleIconNodeConfig(integrationActionBlockConfig, action.label)] as const,
    ),
  ]);
  return new IconsGroup(new NodesGroup(nodeConfigs), Object.fromEntries(entries));
};
