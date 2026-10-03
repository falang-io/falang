import { COMMENT_NAME } from '@falang/dto';
import { functionalSchemeFactory, type IFunctionStructureSchemeFactoryParams } from '@falang/typescript-scheme';
import { ACTIVEPIECES_ACTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { buildActivepiecesActionIconsGroup } from './blocks/activepieces-action/activepieces-action-icons-group.js';
import { ActivepiecesPickerModule } from './blocks/activepieces-action/activepieces-picker.module.js';
import type {
  IActivepiecesCatalogProvider,
  IActivepiecesFieldOptionsProvider,
  IFieldOptionsProvider,
} from './registry/di-tokens.js';
import { IntegrationsModule } from './registry/integrations.module.js';
import { buildChoiceNodesIconsGroup } from './integrations-nodes/choice-nodes-icons-group.js';
import { buildIntegrationNodesIconsGroup } from './integrations-nodes/integration-nodes-icons-group.js';
import { buildQuestionNodesIconsGroup } from './integrations-nodes/question-nodes-icons-group.js';
import { buildMagicIconsGroup } from './magic/magic-icons-group.js';
import { buildCommentIconsGroup } from './comment/comment-icons-group.js';
import { MagicModule } from './magic/magic-module.js';
import { buildTriggerFunctionIconsGroup } from './trigger-function/trigger-function-icons-group.js';

export interface IWorkflowFunctionalSchemeFactoryParams extends IFunctionStructureSchemeFactoryParams {
  integrations: readonly IWorkflowIntegration[];
  /** Live read access to the project's configured credential instances — see `ICredentialsProvider`. */
  getCredentialInstances?: () => readonly IIntegrationInstance[];
  /** Backs any `kind: 'select'` field with a `loadOptions` hook (e.g. `call-ai-text`'s `model`) — see `IFieldOptionsProvider`. */
  getFieldOptionsProvider?: () => IFieldOptionsProvider;
  /** Backs the `activepieces-action` node's picker/props form — see `IActivepiecesCatalogProvider`. */
  getActivepiecesCatalogProvider?: () => IActivepiecesCatalogProvider;
  /** Backs `DROPDOWN`/`MULTI_SELECT_DROPDOWN` ActivePieces props — see `IActivepiecesFieldOptionsProvider`. */
  getActivepiecesFieldOptionsProvider?: () => IActivepiecesFieldOptionsProvider;
}

/**
 * `functionalSchemeFactory` (plain-TypeScript functions) extended with `trigger-function`'s node
 * kinds and every registered vendor's action/trigger node kinds — shared by both `function` and
 * `trigger-function` documents (see `WorkflowStore.buildScheme`) so a trigger-bound function and an
 * ordinary one can both call e.g. `telegram-send-message`. Also always registers the `magic` node kind's
 * single-block icon and `MagicModule` (ADR 0046 (private)) so documents containing magic nodes open; the
 * host seam is the optional `TOKEN_MAGIC_HOST`, and `defaultInsertNodeName` (from `functionalSchemeFactory`)
 * is how a host makes a plain valence-point click insert `'magic'`.
 */
export const workflowFunctionalSchemeFactory = ({
  integrations,
  getCredentialInstances,
  getFieldOptionsProvider,
  getActivepiecesCatalogProvider,
  getActivepiecesFieldOptionsProvider,
  extraModules,
  extraIconsGroups,
  ...props
}: IWorkflowFunctionalSchemeFactoryParams) =>
  functionalSchemeFactory({
    ...props,
    extraIconsGroups: [
      buildTriggerFunctionIconsGroup(),
      buildIntegrationNodesIconsGroup(integrations),
      buildQuestionNodesIconsGroup(integrations),
      buildChoiceNodesIconsGroup(integrations),
      buildActivepiecesActionIconsGroup(),
      buildMagicIconsGroup(),
      buildCommentIconsGroup(),
      ...(extraIconsGroups ?? []),
    ],
    // Per-vendor actions/questions/choices are added by `IntegrationsModule`'s own nested
    // "Integrations → vendor" menu (filtered by the project's configured instances).
    extraInsertableItems: [ACTIVEPIECES_ACTION_NAME, COMMENT_NAME],
    extraModules: [
      new IntegrationsModule(
        integrations,
        getCredentialInstances,
        getFieldOptionsProvider,
        getActivepiecesCatalogProvider,
        getActivepiecesFieldOptionsProvider,
      ),
      new ActivepiecesPickerModule(),
      new MagicModule(),
      ...(extraModules ?? []),
    ],
  });
