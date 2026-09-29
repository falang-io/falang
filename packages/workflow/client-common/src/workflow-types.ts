import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME, type TTriggerFunctionBodyData } from '@falang/workflow-dto';

export type DocumentType = 'function' | 'objects-structure' | 'trigger-function';

export interface WorkflowFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface WorkflowDocument {
  id: string;
  name: string;
  /**
   * Any tree document type string, not just `DocumentType` — includes the pinned `integrations`
   * document (see ADR 0006), which is never opened as a scheme tab (see `pinned`/`ProjectTree`).
   */
  type: string;
  folderId: string | null;
  /** True for the project's singleton, non-deletable, non-movable documents (e.g. `integrations`). */
  pinned?: boolean;
  /** Absent until the bulk documents load (see `ProjectSync`) fills it in — the tree loads first, without payloads. */
  data?: INode;
  /**
   * Payload for `custom`-typed documents (e.g. the pinned `integrations` document, see ADR 0006) —
   * mirrors `IProjectDocument.data`. Kept separate from `data` (which is `INode`-shaped, for scheme
   * documents) rather than widening `data`'s type, since the two are never populated for the same document.
   */
  customData?: unknown;
}

export const ROOT_NODE: Record<DocumentType, string> = {
  function: 'function',
  'objects-structure': 'objects-structure',
  'trigger-function': TRIGGER_FUNCTION_NAME,
};

/**
 * `trigger-function`'s `childTuple` is `[function-header, trigger-function-body, function-footer]` —
 * see `@falang/workflow-dto`'s `triggerFunctionNodesGroup`. `undefined` for anything that isn't a
 * loaded `trigger-function` document (the tree loads before document payloads, see `WorkflowDocument.data`'s
 * own doc comment) — used by `ScheduleStatusStore`'s "does this project have a schedule trigger at all"
 * check, see ADR 0037 (private) §7.
 */
export const getTriggerFunctionBodyData = (
  doc: Pick<WorkflowDocument, 'type' | 'data'>,
): TTriggerFunctionBodyData | undefined => {
  if (doc.type !== TRIGGER_FUNCTION_NAME || !doc.data) return;
  const body = doc.data.children?.[1];
  if (body?.name !== TRIGGER_FUNCTION_BODY_NAME) return;
  return body.data as TTriggerFunctionBodyData;
};
