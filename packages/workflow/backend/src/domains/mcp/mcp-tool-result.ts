import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** A successful tool call — `data` is JSON-stringified into the one text content block every tool here returns. */
export const okResult = (data: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

/**
 * A tool-result error (`isError: true`) — per ADR 0009 (private)'s rule (reused
 * here, see the ADR 0029's "Tools" bullet: "Every error → an MCP tool error … never an unhandled
 * throw"), an invalid/rejected call bounces back to the calling agent as a normal tool result the
 * model can read and react to, not a protocol-level failure.
 */
export const errorResult = (message: string): CallToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Wraps a tool handler so any thrown error (a Nest `HttpException` from a wrapped service —
 * `NotFoundException`/`ConflictException`/`ForbiddenException`/…, `assertMcpProjectScope`'s plain
 * `Error`, or anything else) becomes an `errorResult` instead of an unhandled rejection reaching the
 * SDK's own transport-level error handling.
 */
export const withToolErrors =
  <TArgs extends readonly unknown[]>(handler: (...args: TArgs) => CallToolResult | Promise<CallToolResult>) =>
  async (...args: TArgs): Promise<CallToolResult> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResult(messageOf(error));
    }
  };
