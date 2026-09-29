import { createSchemeToken } from '@falang/di';
import type { AgentSession } from './agent-session.js';

export const TOKEN_AGENT_SESSION = createSchemeToken<AgentSession>('AGENT_SESSION');
