import type {
  IActionDescriptor,
  IChoiceDescriptor,
  IQuestionDescriptor,
  ITriggerDescriptor,
  IWorkflowIntegration,
} from '@falang/workflow-integrations-common';

/** Node-name-keyed lookup over every registered vendor's descriptors — backs the generic action/trigger/question/choice blocks. */
export class IntegrationsRegistryStore {
  readonly integrations: readonly IWorkflowIntegration[];

  constructor(integrations: readonly IWorkflowIntegration[]) {
    this.integrations = integrations;
  }

  findAction(nodeName: string): IActionDescriptor | undefined {
    return this.integrations.flatMap((integration) => integration.actions).find((item) => item.name === nodeName);
  }

  findTrigger(nodeName: string): ITriggerDescriptor | undefined {
    return this.integrations.flatMap((integration) => integration.triggers).find((item) => item.name === nodeName);
  }

  findQuestion(nodeName: string): IQuestionDescriptor | undefined {
    return this.integrations
      .flatMap((integration) => integration.questions ?? [])
      .find((item) => item.name === nodeName);
  }

  findChoice(nodeName: string): IChoiceDescriptor | undefined {
    return this.integrations.flatMap((integration) => integration.choices ?? []).find((item) => item.name === nodeName);
  }
}
