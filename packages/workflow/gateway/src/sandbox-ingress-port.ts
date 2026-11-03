/**
 * Sandbox bots (ADR 0073 (private)): what `IntegrationsRuntimeService` needs from the host that owns the platform's test
 * bots. Installed post-construction via `setSandboxIngress` (the host depends on the runtime service, not the other way).
 */
export interface ISandboxIngressTarget {
  readonly vendor: string;
  readonly projectId: string;
  readonly credentialId: string;
}

export interface ISandboxIngressPort {
  /**
   * The real test-bot credential field(s) for `vendor` (`{ [adapter.tokenField]: token }`), or `undefined` when no
   * test bot is configured — the dev target of a sandbox instance then simply does not start.
   */
  getBotFields(vendor: string): Readonly<Record<string, string>> | undefined;
  /** Subscribes `handler` to the updates routed to `target`; returns the unsubscribe function. */
  subscribe(target: ISandboxIngressTarget, handler: (update: unknown) => Promise<void>): () => void;
}
