import { HttpException } from '@nestjs/common';

/** Codes the relay answers with (ADR 0081 (private)); the OpenAI activity code fails non-retryably on the refusals. */
export type TAiProviderRelayErrorCode =
  | 'invalid_project_token'
  | 'ai_provider_not_configured'
  | 'invalid_request'
  | 'model_not_allowed'
  | 'stream_not_supported'
  | 'not_supported_by_built_in_provider'
  | 'ai_provider_busy'
  | 'ai_provider_unreachable'
  | 'ai_provider_timeout';

/**
 * A relay-originated error. The body carries the code twice: at the top level (`{ statusCode, code, message }`, the
 * backend's usual shape) and as an OpenAI-style `error` object, so an OpenAI-compatible client shows the message too.
 */
export const aiProviderRelayError = (status: number, code: TAiProviderRelayErrorCode, message: string): HttpException =>
  new HttpException(
    { statusCode: status, code, message, error: { code, message, type: 'falang_ai_provider' } },
    status,
  );
