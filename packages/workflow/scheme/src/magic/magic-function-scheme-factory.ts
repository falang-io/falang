import type { IconsGroup } from '@falang/scheme';
import {
  workflowFunctionalSchemeFactory,
  type IWorkflowFunctionalSchemeFactoryParams,
} from '../workflow-functional-scheme-factory.js';
import { buildMagicFunctionIconsGroup } from './magic-icons-group.js';
import { MagicFunctionModule } from './magic-function-module.js';

export interface IMagicFunctionSchemeFactoryParams extends IWorkflowFunctionalSchemeFactoryParams {
  /** The user finished editing the popup header's spell (old and new text). */
  onHeaderSpellCommitted?: (prev: string, next: string) => void;
}

/**
 * The popup scheme for editing one magic node's steps (root: a transient `magic-function`, see
 * `buildMagicFunctionDocument`). An ordinary workflow function scheme plus the popup icon group; `magic`
 * is never offered or default-inserted here (nothing lists it, `defaultInsertNodeName` is left at
 * `'action'`, and the body's `excludeChildren` rejects it in validation).
 */
export const magicFunctionSchemeFactory = ({
  onHeaderSpellCommitted,
  extraIconsGroups,
  extraModules,
  ...props
}: IMagicFunctionSchemeFactoryParams) =>
  workflowFunctionalSchemeFactory({
    ...props,
    extraIconsGroups: [buildMagicFunctionIconsGroup(), ...(extraIconsGroups ?? [])] as IconsGroup[],
    extraModules: [new MagicFunctionModule(onHeaderSpellCommitted), ...(extraModules ?? [])],
  });
