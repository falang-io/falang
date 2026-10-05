// oxlint-disable no-undefined, init-declarations, max-classes-per-file, no-map-spread, no-array-callback-reference, catch-error-name, prefer-string-raw, max-lines, no-console -- spike code (ADR 0061 (private))
import type { IAgentToolProvider, ILlmToolCall, ILlmToolDefinition, TToolExecutionResult } from '@falang/agent';

const CODE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  create_integration_instance:
    'Creates a credential instance for a vendor (fields optional — leave secrets blank, the user fills them in) and ' +
    'returns its id. It then appears in integrations.ts as a global constant with its methods in vendors.d.ts.',
  search_integrations:
    'Read-only. Finds integration vendors (Telegram, AI providers, CRMs, payments, HTTP, …) by English keywords: ' +
    'returns `vendor`, `notes`, `credentialFields` (for create_integration_instance) and `triggers` (name, notes). Pass ' +
    'every relevant keyword at once, e.g. ["telegram", "bot", "ai", "gpt"].',
};

/**
 * The node interface's integration tools, narrowed for the code interface (ADR 0061 spike): only the two that make
 * sense next to the files, with descriptions that talk about files instead of node kinds and trigger documents.
 */
export class CodeIntegrationTools implements IAgentToolProvider {
  readonly tools: readonly ILlmToolDefinition[];
  private readonly inner: IAgentToolProvider;

  /** Names an instance id as code sees it (its `integrations.ts` constant and vendor methods). */
  private readonly describeInstance?: (instanceId: string) => string | undefined;

  constructor(inner: IAgentToolProvider, describeInstance?: (instanceId: string) => string | undefined) {
    this.inner = inner;
    this.describeInstance = describeInstance;
    this.tools = inner.tools
      .filter((tool) => tool.name in CODE_DESCRIPTIONS)
      .map((tool) => ({ ...tool, description: CODE_DESCRIPTIONS[tool.name] ?? tool.description }));
  }

  async execute(call: ILlmToolCall): Promise<TToolExecutionResult> {
    if (!(call.name in CODE_DESCRIPTIONS)) return { error: `Unknown tool: ${call.name}`, ok: false };
    const result = await this.inner.execute(call);
    if (call.name !== 'create_integration_instance' || !result.ok || !this.describeInstance) return result;
    try {
      const { instanceId } = JSON.parse(result.content) as { instanceId?: string };
      const description = instanceId ? this.describeInstance(instanceId) : undefined;
      return description ? { content: `${result.content}\n${description}`, ok: true } : result;
    } catch {
      return result;
    }
  }
}
