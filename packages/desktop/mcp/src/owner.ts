/**
 * The desktop stdio host's fixed lock `owner` (see ADR 0029 (private),
 * "Contract clarifications" §4): v1 assumes one agent per project folder, so every `set_document`/
 * `lock_document`/`unlock_document` call from this process uses the same constant rather than a
 * per-connection id — two Claude Code sessions in the same folder share the lock (the lesser evil
 * versus a restarted session locked out for the 5-minute TTL), unlike the workflow HTTP host's
 * per-personal-access-token `"pat:<tokenId>"` owner.
 */
export const MCP_LOCK_OWNER = 'mcp';
