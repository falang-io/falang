import type { DocumentStackRegistry } from '@falang/mcp-core';

/** Bundles what every handler needs to talk to `project-fs` and validate against the right `NodesStack` — built once in `server.ts`, passed to every registered handler. */
export interface IToolContext {
  readonly projectDir: string;
  readonly projectType: string;
  readonly registry: DocumentStackRegistry;
}
