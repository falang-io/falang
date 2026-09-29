import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { IntegrationActionBlockComponent } from './integration-action-block.cmp.js';
import { IntegrationActionEditorComponent } from './integration-action-editor.cmp.js';
import { IntegrationActionEditorStore, type TIntegrationActionData } from './integration-action-editor.store.js';

/**
 * One block config shared by every action node of every registered vendor — see ADR 0006's "generic
 * field-driven UI, not bespoke DTOs/blocks per action". Register it against each action's node name,
 * the same way `arrOpInputBlockConfig` already backs both `arr-push` and `arr-unshift`.
 */
export const integrationActionBlockConfig = {
  view: IntegrationActionBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    type: EditorType.configurable,
    view: IntegrationActionEditorComponent,
    editorFactory: (params) => new IntegrationActionEditorStore(params),
  },
} satisfies IBlockConfig<TIntegrationActionData>;
