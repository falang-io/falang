import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Every successful tool call returns one JSON text content block — see ADR 0029 (private)'s phase E task description. */
export const jsonResult = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});

/**
 * Every error path returns a tool error (`isError: true`) rather than throwing out of the handler —
 * an invalid call bounces back to the agent as a tool-result error without ever crashing the
 * connection, matching `0009`'s "invalid call bounces back... without touching the tree" rule this
 * ADR reuses for `set_document`.
 */
export const errorResult = (message: string): CallToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

/** `error instanceof Error ? error.message : String(error)` shows up at every handler's catch site. */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
