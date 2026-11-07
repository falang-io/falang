import type { IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { findTriggerDescriptor, type ITriggerFunctionBodyData } from './compile-trigger-function.js';
import { collectTableFields } from './table-fields.js';
import { buildTableTriggerRuntimeCode } from './table-trigger-runtime.js';

/**
 * The workflows-module block for `tables` record triggers (ADR 0075 (private), amendment A1): the runtime plus the
 * name -> id map of every table document, only when some trigger-function is bound to a trigger with
 * `transformPayload: tables` — otherwise `''`, leaving every other project's output untouched. Ends with a blank line.
 */
export const buildTableTriggerRuntime = (
  triggerFunctionDocuments: readonly IProjectDocument[],
  integrations: readonly IWorkflowIntegration[],
  documents: readonly IProjectDocument[],
): string => {
  const needsTransform = triggerFunctionDocuments.some((document) => {
    const [, body] = document.root?.children ?? [];
    if (!body) return false;
    return (
      findTriggerDescriptor(body.data as ITriggerFunctionBodyData, integrations)?.transformPayload?.kind === 'tables'
    );
  });
  return needsTransform ? `${buildTableTriggerRuntimeCode(collectTableFields(documents))}\n\n` : '';
};
