import type { IAgentContextProvider, IAgentRunContext } from '@falang/agent';
import type { TScopeVariableType } from '@falang/typescript-common';
import { collectScopeVariables } from '@falang/typescript-common';
import { variableInfoToTsType } from '@falang/typescript-dto';

const renderType = (type: TScopeVariableType): string =>
  type.type === 'raw' ? type.expression : variableInfoToTsType(type);

/**
 * Describes the identifiers in scope at the run's active document's root node (ADR 0036 — there is no
 * per-node "current position" any more, only the active document as a whole) — `null` when there's no
 * active document, or when resolving it yields no root node yet (e.g. a brand-new, still-empty document).
 */
export class ScopeVariablesContextProvider implements IAgentContextProvider {
  describe(context: IAgentRunContext): string | null {
    const root = context.getActiveScheme()?.rootNode;
    if (!root) return null;
    const variables = collectScopeVariables(root);
    if (variables.length === 0) return null;
    const lines = variables.map((v) => `- ${v.name}: ${renderType(v.type)}`);
    return `Identifiers in scope at node ${root.id}:\n${lines.join('\n')}`;
  }
}
