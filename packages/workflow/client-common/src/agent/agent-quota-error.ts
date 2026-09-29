/**
 * The agent chat route answered `402 Payment Required` — the deployment refused the call because the
 * user's agent credits are exhausted (a metering `IAgentUsageSink` in the cloud edition throws it; the
 * community edition never does). Distinguishable from a generic `Error` so a future UI can offer a top-up
 * instead of a bare message; `message` is still the server's text, so today's error display is unchanged.
 */
export class AgentQuotaError extends Error {
  readonly status = 402;
  readonly body: unknown;

  constructor(message: string, body: unknown) {
    super(message);
    this.name = 'AgentQuotaError';
    this.body = body;
  }
}
