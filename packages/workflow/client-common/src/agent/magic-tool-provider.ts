import {
  AGENT_TOOLS,
  validateNodeSpecs,
  type IAgentNodeKindFilter,
  type IAgentToolProvider,
  type ILlmToolCall,
  type ILlmToolDefinition,
  type TToolExecutionResult,
} from '@falang/agent';
import type { INode, INodeMeta } from '@falang/dto';
import { resolveService } from '@falang/di';
import {
  CMD_DELETE_NODE,
  CMD_INSERT_NODE,
  CMD_SET_META,
  TOKEN_HISTORY,
  type NodeStore,
  type Scheme,
} from '@falang/scheme';
import { MAGIC_NAME } from '@falang/workflow-dto';

export const FILL_MAGIC_NODE_TOOL = 'fill_magic_node';

const ok = (content: string): TToolExecutionResult => ({ content, ok: true });
const fail = (error: string): TToolExecutionResult => ({ error, ok: false });

const insertNodesSchema = AGENT_TOOLS.find((tool) => tool.name === 'insert_nodes')?.inputSchema as
  | { $defs?: Record<string, unknown> }
  | undefined;

const TOOL: ILlmToolDefinition = {
  name: FILL_MAGIC_NODE_TOOL,
  description:
    "Writes the steps of the magic node this run is about: replaces ALL of the node's existing children with " +
    '`children`, in order. Call it exactly once with the complete list, then call `finish`. Only the magic ' +
    "node's own id is accepted. The list is validated as a whole before anything is applied (nothing is changed " +
    'on an error — read the message, fix the list and call again).\n\n' +
    "Each entry is a node spec `{ name, data?, children?, out? }` exactly like `insert_nodes`' `node`: `data` " +
    "follows the node kind's schema from get_node_kinds; `children` — omit it for the kind's default; for a kind " +
    'whose `children` is `{"tuple": [...]}` (e.g. `if`) give exactly one entry per slot, in order; `out` — only ' +
    'for a kind with `haveOut: true`, `{ name, data? }` (break/continue/return/throw), never null. The first ' +
    'entry of any list can never carry an `out`. No `magic` node may appear inside.',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'The id of the magic node (given in the request).' },
      children: { type: 'array', items: { $ref: '#/$defs/nodeSpec' } },
      note: {
        type: 'string',
        description:
          'One short line for the person: which integration instance you used, which values are placeholders they still need to fill in. Shown as the node note.',
      },
    },
    required: ['nodeId', 'children'],
    ...(insertNodesSchema?.$defs ? { $defs: insertNodesSchema.$defs } : {}),
  },
};

const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;

const asList = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export interface IMagicToolProviderParams {
  /** The one magic node this run may fill. */
  readonly nodeId: string;
  /** The **main** scheme holding that node (resolved lazily — the tab's scheme may be rebuilt). */
  readonly getScheme: () => Scheme | null;
  readonly nodeKindFilter?: IAgentNodeKindFilter;
  /** `true` while the node is being filled, so `MagicModule` doesn't flag the edit as a hand edit. */
  readonly setFilling: (nodeId: string, filling: boolean) => void;
  /** Called once a fill was applied; `noted` = the call carried a `note` (stored as `meta.note` in the same undo step). */
  readonly onFilled?: (info: { noted: boolean }) => void;
}

const withoutHandEdited = (meta: NodeStore['meta']): INodeMeta => {
  const { handEdited: _ignored, ...rest } = meta ?? {};
  return rest;
};

/**
 * `IAgentToolProvider` with the one write tool of a magic run (ADR 0046 (private)): `fill_magic_node`
 * replaces the run's magic node's children in the main scheme — one history group, `meta.handEdited`
 * cleared — through existing commands only.
 */
export class MagicToolProvider implements IAgentToolProvider {
  readonly tools: readonly ILlmToolDefinition[] = [TOOL];

  private readonly params: IMagicToolProviderParams;

  constructor(params: IMagicToolProviderParams) {
    this.params = params;
  }

  execute(call: ILlmToolCall): TToolExecutionResult {
    if (call.name !== FILL_MAGIC_NODE_TOOL) return fail(`Unknown tool: ${call.name}`);
    const input = asRecord(call.input);
    if (!input) return fail(`${FILL_MAGIC_NODE_TOOL}: invalid input`);
    if (input.nodeId !== this.params.nodeId) {
      return fail(`${FILL_MAGIC_NODE_TOOL}: only the magic node ${this.params.nodeId} can be filled in this run`);
    }
    const specs = asList(input.children);
    if (!specs) return fail(`${FILL_MAGIC_NODE_TOOL}: children must be an array of node specs`);
    const scheme = this.params.getScheme();
    const magic = scheme?.nodes.getNodeSafe(this.params.nodeId);
    if (!scheme || !magic || magic.name !== MAGIC_NAME) {
      return fail(`${FILL_MAGIC_NODE_TOOL}: the magic node no longer exists`);
    }
    const validated = validateNodeSpecs(scheme, magic.id, specs, this.params.nodeKindFilter);
    if (!validated.ok) return fail(`${FILL_MAGIC_NODE_TOOL}: ${validated.error}`);
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    this.apply(scheme, magic, validated.nodes, note);
    this.params.onFilled?.({ noted: note !== '' });
    return ok(JSON.stringify({ filled: validated.nodes.length }));
  }

  private apply(scheme: Scheme, magic: NodeStore, nodes: INode[], note: string): void {
    const history = scheme.container.isRegistered(TOKEN_HISTORY, true)
      ? resolveService(TOKEN_HISTORY, scheme.container)
      : null;
    const run = (): void => {
      for (const id of magic.children.map((child) => child.id)) {
        scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id });
      }
      for (const [index, node] of nodes.entries()) {
        scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index, node, parentId: magic.id });
      }
      if (note || (magic.meta && 'handEdited' in magic.meta)) {
        const meta = withoutHandEdited(magic.meta);
        scheme.commands.dispatchCommand(CMD_SET_META, { id: magic.id, meta: note ? { ...meta, note } : meta });
      }
    };
    this.params.setFilling(magic.id, true);
    try {
      if (history) history.runGrouped(run);
      else run();
    } finally {
      this.params.setFilling(magic.id, false);
    }
  }
}
