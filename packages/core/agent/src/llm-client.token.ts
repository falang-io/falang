import { createSchemeToken } from '@falang/di';
import type { ILlmClient } from './llm-client.js';

export const TOKEN_LLM_CLIENT = createSchemeToken<ILlmClient>('LLM_CLIENT');
