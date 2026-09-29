// Moved to `@falang/mcp-core` (see ADR 0029 (private)) so the in-app agent
// and MCP's `get_node_kinds` describe node kinds from exactly the same code. Re-exported here so
// nothing importing `@falang/agent`'s `node-kinds.js` needs to change.
export type { INodeKindDescription, INodeKindsListing, TNodeKindChildren } from '@falang/mcp-core';
export { buildNodeKindsCatalog, describeNodeKind, describeNodeKinds, getAllowedChildNames } from '@falang/mcp-core';
