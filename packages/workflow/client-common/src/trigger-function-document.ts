import { createTriggerFunctionNode, TRIGGER_FUNCTION_NAME, type TTriggerFunctionBodyData } from '@falang/workflow-dto';
import { generateUuid } from './generate-uuid.js';
import type { WorkflowDocument } from './workflow-types.js';

/** The root node's trigger data is set up front from the "New trigger" form, unlike `createDocument`'s blank default. */
export const buildTriggerFunctionDocument = (
  name: string,
  bodyData: TTriggerFunctionBodyData,
  folderId: string | null,
): WorkflowDocument => ({
  id: generateUuid(),
  name,
  type: TRIGGER_FUNCTION_NAME,
  folderId,
  data: createTriggerFunctionNode(bodyData),
});
