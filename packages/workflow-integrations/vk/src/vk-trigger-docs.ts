import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';

export interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

/** `trigger-function`'s childTuple is `[function-header, trigger-function-body, function-footer]` — see `@falang/workflow-dto`. */
export const getTriggerFunctionBodyData = (doc: IIntegrationDocumentRecord): ITriggerFunctionBodyData | undefined => {
  const body = doc.root?.children?.[1];
  if (body?.name !== TRIGGER_FUNCTION_BODY_NAME) return;
  return body.data as ITriggerFunctionBodyData;
};

export const findBoundTriggerFunctions = async (
  ctx: IIntegrationBackendContext,
): Promise<readonly IIntegrationDocumentRecord[]> => {
  const triggerFunctionDocuments = await ctx.getDocumentsByType(TRIGGER_FUNCTION_NAME);
  return triggerFunctionDocuments.filter((doc) => {
    const body = getTriggerFunctionBodyData(doc);
    return body?.vendor === ctx.vendor && body.credentialId === ctx.credentialId;
  });
};

/** Workflow id for journal entries about input no trigger function takes (ADR 0059 (private) §2c). */
export const unboundWorkflowId = (chatId: number | string): string => `vk-unbound-${chatId}`;
