/**
 * The registry of runs waiting for a chat's next message (ADR 0079 (private)), as the gateway sees it: an ingress
 * asks to *claim* the wait a message belongs to. Implemented in `backend` by `MessageWaitsService` over the
 * `message_waits` table and installed with `IntegrationsRuntimeService.setMessageWaits`; vendors reach it through
 * `IIntegrationBackendContext.deliverToMessageWait`.
 */
export interface IMessageWaitClaimParams {
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
  readonly vendor: string;
  readonly credentialId: string;
  readonly chatId: string;
  /** The sender, `null` when the message has none — then only a wait open to anyone in the chat matches. */
  readonly userId: string | null;
}

export interface IClaimedMessageWait {
  readonly waitId: string;
  readonly workflowId: string;
  readonly runId: string;
}

export interface IMessageWaitPort {
  /** Removes and returns the matching unexpired wait — the sender's own first, else one open to anyone — or `null`. */
  claim(params: IMessageWaitClaimParams): Promise<IClaimedMessageWait | null>;
}
