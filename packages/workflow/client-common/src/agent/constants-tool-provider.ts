import type { IAgentToolProvider, ILlmToolCall, ILlmToolDefinition, TToolExecutionResult } from '@falang/agent';
import {
  applyConstantChanges,
  CONSTANT_TYPES,
  describeConstantsForTool,
  LIST_CONSTANTS_DESCRIPTION,
  parseConstantChanges,
  SET_CONSTANTS_DESCRIPTION,
} from '@falang/workflow-dto';
import { generateUuid } from '../generate-uuid.js';
import { projectConstantsOf } from './workflow-runtime-context.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

const ok = (content: string): TToolExecutionResult => ({ content, ok: true });
const fail = (error: string): TToolExecutionResult => ({ error, ok: false });

const VALUE_SCHEMA = { type: ['string', 'number', 'boolean'] } as const;

const TOOLS: readonly ILlmToolDefinition[] = [
  { name: 'list_constants', description: LIST_CONSTANTS_DESCRIPTION, inputSchema: { type: 'object', properties: {} } },
  {
    name: 'set_constants',
    description: SET_CONSTANTS_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        set: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              newName: { type: 'string' },
              type: { type: 'string', enum: [...CONSTANT_TYPES] },
              dev: VALUE_SCHEMA,
              prod: VALUE_SCHEMA,
            },
            required: ['name'],
          },
        },
        delete: { type: 'array', items: { type: 'string' } },
      },
    },
  },
];

/**
 * `list_constants`/`set_constants` for the project's pinned `constants` document. No `Scheme` involved, so the session
 * gives them no focus/undo-group treatment — a write goes through `IWorkflowAgentStore.saveConstants`, the same
 * debounced save the Constants editor uses, and Monaco/background validation pick the new names up from there.
 */
export class ConstantsToolProvider implements IAgentToolProvider {
  readonly tools = TOOLS;

  private readonly store: IWorkflowAgentStore;

  constructor(store: IWorkflowAgentStore) {
    this.store = store;
  }

  execute(call: ILlmToolCall): TToolExecutionResult {
    if (call.name === 'list_constants') {
      return ok(JSON.stringify(describeConstantsForTool(projectConstantsOf(this.store))));
    }
    if (call.name === 'set_constants') return this.setConstants(call.input);
    return fail(`Unknown tool: ${call.name}`);
  }

  private setConstants(input: unknown): TToolExecutionResult {
    if (!this.store.saveConstants) return fail('set_constants: this host cannot edit constants');
    const parsed = parseConstantChanges(input);
    if (!parsed.ok) return fail(`set_constants: ${parsed.errors.join('; ')}`);
    const applied = applyConstantChanges(projectConstantsOf(this.store), parsed.changes, generateUuid);
    if (!applied.ok) return fail(`set_constants: nothing changed — ${applied.errors.join('; ')}`);
    try {
      this.store.saveConstants(applied.data.constants);
    } catch (error) {
      return fail(`set_constants: ${error instanceof Error ? error.message : String(error)}`);
    }
    return ok(JSON.stringify(describeConstantsForTool(applied.data.constants)));
  }
}
