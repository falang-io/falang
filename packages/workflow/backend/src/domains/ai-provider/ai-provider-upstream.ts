import { runWithEgressVendor } from '@falang/workflow-egress';
import { HttpStatus, type Logger } from '@nestjs/common';
import { fetch as undiciFetch, getGlobalDispatcher, type Dispatcher } from 'undici';
import { aiProviderCallsTotal } from '../metrics/metrics.js';
import { aiProviderRelayError } from './ai-provider-relay-errors.js';

/** The vendor the relay speaks for: its upstream calls go through the admin's egress proxy like that vendor's (ADR 0056). */
const AI_PROVIDER_EGRESS_VENDOR = 'openai';

export interface IAiProviderRelayResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: Uint8Array;
}

export interface IAiProviderUpstreamCall {
  readonly url: string;
  readonly apiKey: string;
  readonly rawBody: Uint8Array;
  /** Sent as is: `application/json`, or the pod's own `multipart/form-data; boundary=…`. */
  readonly contentType: string;
  readonly timeoutMs: number;
  readonly logger: Pick<Logger, 'warn'>;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * One upstream call of the built-in AI provider relay (ADR 0081 (private)) under the platform key, routed as the
 * `openai` vendor, with the relay's own timeouts: 504 `ai_provider_timeout`, 502 `ai_provider_unreachable`. The reply
 * (any status) comes back untouched.
 */
export const forwardToAiProvider = async (call: IAiProviderUpstreamCall): Promise<IAiProviderRelayResponse> => {
  const { timeoutMs } = call;
  // The global dispatcher is the egress router once installed (proxy or direct per vendor); the interceptor only
  // lifts undici's 300 s header/body timeouts to the relay's own — a model may think for minutes before answering.
  const dispatcher = getGlobalDispatcher().compose(
    (dispatch: Dispatcher['dispatch']): Dispatcher['dispatch'] =>
      (options, handler) =>
        dispatch({ ...options, headersTimeout: timeoutMs, bodyTimeout: timeoutMs }, handler),
  );
  try {
    return await runWithEgressVendor(AI_PROVIDER_EGRESS_VENDOR, async () => {
      const response = await undiciFetch(call.url, {
        method: 'POST',
        headers: { 'Content-Type': call.contentType, Authorization: `Bearer ${call.apiKey}` },
        body: call.rawBody,
        dispatcher,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: new Uint8Array(await response.arrayBuffer()),
      };
    });
  } catch (error) {
    aiProviderCallsTotal.inc({ result: 'failed' });
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw aiProviderRelayError(
        HttpStatus.GATEWAY_TIMEOUT,
        'ai_provider_timeout',
        `The built-in AI provider did not answer within ${Math.round(timeoutMs / 1000)} s`,
      );
    }
    call.logger.warn(`AI provider upstream call failed: ${describeError(error)}`);
    throw aiProviderRelayError(
      HttpStatus.BAD_GATEWAY,
      'ai_provider_unreachable',
      'The built-in AI provider could not be reached',
    );
  }
};
