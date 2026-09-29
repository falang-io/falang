import type { IModule, Scheme } from '@falang/scheme';
import { resolveService } from '@falang/di';
import type { ILlmClient } from './llm-client.js';
import { TOKEN_LLM_CLIENT } from './llm-client.token.js';
import type { IAgentContextProvider } from './context-provider.js';
import type { IAgentDocumentResolver } from './document-resolver.js';
import type { IAgentToolProvider } from './tool-provider.js';
import { AgentSession } from './agent-session.js';
import { TOKEN_AGENT_SESSION } from './agent-session.token.js';

export interface IAgentModuleOptions {
  readonly llmClient?: ILlmClient;
  readonly contextProviders?: readonly IAgentContextProvider[];
  /** See `IAgentSessionExtraOptions` (ADR 0034) — cross-document editing support. */
  readonly documentResolver?: IAgentDocumentResolver;
  readonly onOpenDocument?: (scheme: Scheme) => void;
  readonly onRunFinished?: () => void;
  readonly toolProviders?: readonly IAgentToolProvider[];
}

export class AgentModule implements IModule {
  private readonly options: IAgentModuleOptions;

  constructor(options: IAgentModuleOptions = {}) {
    this.options = options;
  }

  register(scheme: Scheme): void {
    if (this.options.llmClient) scheme.container.registerInstance(TOKEN_LLM_CLIENT, this.options.llmClient);
  }

  initialize(scheme: Scheme): void {
    const client = resolveService(TOKEN_LLM_CLIENT, scheme.container);
    scheme.container.registerInstance(
      TOKEN_AGENT_SESSION,
      // `scheme` becomes this session's `defaultScheme` (ADR 0036) — `AgentModule` is the single-scheme
      // convenience (playground/tests), so every run implicitly targets the scheme it's registered on
      // unless a caller explicitly passes `IAgentRunOptions.activeDocumentId`. A host wanting the ADR's
      // per-project model (one `AgentSession` shared across a whole project) constructs `AgentSession`
      // itself instead of using this module.
      new AgentSession(scheme, client, this.options.contextProviders ?? [], {
        documentResolver: this.options.documentResolver,
        onOpenDocument: this.options.onOpenDocument,
        onRunFinished: this.options.onRunFinished,
        toolProviders: this.options.toolProviders,
      }),
    );
  }

  dispose(scheme: Scheme): void {
    resolveService(TOKEN_AGENT_SESSION, scheme.container).cancel();
  }
}
