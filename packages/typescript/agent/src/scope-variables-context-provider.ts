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
    const scheme = context.getActiveScheme();
    const focus = (context.focusNodeId && scheme?.nodes.getNodeSafe(context.focusNodeId)) || null;
    const target = focus ?? scheme?.rootNode;
    if (!target) return null;
    const variables = collectScopeVariables(target);
    if (variables.length === 0) return null;
    const lines = variables.map((v) => `- ${v.name}: ${renderType(v.type)}`);
    const where = focus ? `at node ${focus.id} (the insertion point)` : `at node ${target.id}`;
    return `Identifiers in scope ${where}:\n${lines.join('\n')}`;
  }
}
