import type { TVariableInfo } from '@falang/typescript-dto';
import { taskOptionDataTypeToVariableInfo, type IQuestionOptionDataWithType } from './question-extensions.js';
import type { IWorkflowIntegration } from './types.js';

/**
 * Structurally identical to `@falang/typescript-common`'s container-scope contributor shape
 * (`(data: unknown) => IScopeVariable[]`, where `IScopeVariable.type` is
 * `TVariableInfo | IRawVariableType`) — a function returning a plain (mutable) array of
 * `{ name, type: TVariableInfo }` is assignable to it with no adapter needed. Declared structurally
 * here, not imported, for the same "neither package should depend on the other" reason
 * `action-scope-contributor.ts`'s `TActionScopeContributor` gives.
 */
export type TQuestionScopeContributor = (data: unknown) => { readonly name: string; readonly type: TVariableInfo }[];

/**
 * Registers one container-scope contributor per question with an `answerScope`
 * (ADR 0040 (private) §4), keyed by that question's own
 * `<name>-option` node kind — mirrors `@falang/typescript-common`'s statically-known
 * `call-ai-choice-option` entry, just populated at runtime since the variable name/type/option node
 * name all come from the descriptor rather than being one of this package's own fixed node kinds.
 * `answerScope.variableName`/`type` are always bound; with `perOptionData`, a non-`void` option's own
 * `data` is bound too, typed by that option's own `dataType` (an option with `dataType: 'void'`
 * contributes no `data` variable at all — there's no value to type). Called from the same two sites
 * `registerIntegrationScopeContributors` is (`@falang/workflow-scheme`'s `IntegrationsModule.register()`
 * and `@falang/workflow-compiler`'s `compileProject`), passing each host's own
 * `registerContainerScopeContributor` import in.
 */
export const registerQuestionScopeContributors = (
  integrations: readonly IWorkflowIntegration[],
  register: (nodeName: string, contributor: TQuestionScopeContributor) => void,
): void => {
  for (const integration of integrations) {
    for (const question of integration.questions ?? []) {
      const { answerScope } = question;
      if (!answerScope) continue;
      const optionNodeName = `${question.name}-option`;
      register(optionNodeName, (data) => {
        const variables: { name: string; type: TVariableInfo }[] = [
          { name: answerScope.variableName, type: answerScope.type },
        ];
        if (answerScope.perOptionData) {
          const option = data as Partial<IQuestionOptionDataWithType> | undefined;
          if (option?.dataType && option.dataType !== 'void') {
            variables.push({ name: 'data', type: taskOptionDataTypeToVariableInfo(option.dataType) });
          }
        }
        return variables;
      });
    }
  }
};
