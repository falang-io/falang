import type { ILlmToolCall, ILlmToolDefinition, IAgentToolProvider, TToolExecutionResult } from '@falang/agent';
import { DRIVER_BUNDLE_JSON_SCHEMA } from '@falang/desktop-arduino-dto/src/driver-bundle.js';
import type { IDriverBundle } from '@falang/desktop-arduino-dto/src/driver-bundle.js';
import type { IDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';

/** Where a driver came from (`project` > `library` > `bundled` in precedence). */
export type TDriverToolScope = 'bundled' | 'library' | 'project';

export interface IDriverToolEntry {
  readonly config: IDriverConfig;
  readonly scope: TDriverToolScope;
  /** `ok`, or why the driver is not usable right now (`invalid-on-disk`, `load-error`, `missing-on-disk`). */
  readonly status: string;
  readonly errors?: readonly string[];
}

/** The `validateDriverBundle` result shape (`@falang/desktop-arduino-compiler`), structurally — passed through to the LLM as is. */
export interface IDriverToolValidation {
  readonly ok: boolean;
  readonly errors: readonly unknown[];
  readonly warnings: readonly unknown[];
}

/**
 * What `DriverToolProvider` needs from its host (ADR 0054 (private) §6): IPC to `main` in the app, direct calls to the
 * phase-1 functions in a headless host. `setProjectDriver` must, after a successful write, have reloaded the driver
 * registry and rebuilt the open schemes before it resolves — the run's next `get_node_kinds`/`insert_nodes` has to see the
 * new `driver-action::…` kinds.
 */
export interface IDriverToolHost {
  listDrivers(): Promise<readonly IDriverToolEntry[]> | readonly IDriverToolEntry[];
  /** The effective driver (the one a build would use); throws for an unknown id. */
  getDriver(id: string): Promise<IDriverBundle>;
  /** Validates without writing; `bundle` is untrusted (the schema stage is part of the validation). */
  validateDriver(bundle: unknown): Promise<IDriverToolValidation>;
  /** Project-scope create-or-replace after full validation; `ok: false` means nothing was written. */
  setProjectDriver(bundle: unknown): Promise<IDriverToolValidation>;
}

const ok = (content: string): TToolExecutionResult => ({ content, ok: true });
const fail = (error: string): TToolExecutionResult => ({ error, ok: false });

const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;

/** The bundle's JSON Schema, generated from the zod schema (cannot drift) — "the format lives in the tool definition". */
const { $schema: _ignored, ...BUNDLE_SCHEMA } = DRIVER_BUNDLE_JSON_SCHEMA;

const FORMAT =
  'A driver is a bundle { formatVersion: 1, config, files }: config is driver.config.json (id kebab-case, label, notes, ' +
  'includes, sourceFiles, declarations, actions, optional device) and files maps each file name listed in ' +
  'includes/sourceFiles to its text. Wrap the library or registers in plain C functions whose names share a prefix ' +
  'unique to this driver (it must not collide with any other driver or Arduino symbol), declare every function an ' +
  'action calls in config.declarations as a `declare function …;` line, make one action per user-visible operation, ' +
  'and give the driver and every action a plain-English `notes`.';

const bundleInput = {
  properties: { bundle: BUNDLE_SCHEMA },
  required: ['bundle'],
  type: 'object',
};

const TOOLS: readonly ILlmToolDefinition[] = [
  {
    description:
      "Read-only. Lists every Arduino device driver this project can use (built-in, personal library, the project's " +
      'own): id, label, scope, notes, status, each action (id, label, notes, fields with name and kind, resultType) and ' +
      'the device fields if the driver can be added to the Devices document. A driver action is the node kind ' +
      '`driver-action::<driverId>::<actionId>`.',
    inputSchema: { properties: {}, type: 'object' },
    name: 'list_drivers',
  },
  {
    description:
      'Read-only. Returns one driver (the effective one) as a bundle { formatVersion, config, files } — the exact format ' +
      'validate_driver/set_driver take. Use it to copy or modify an existing driver.',
    inputSchema: { properties: { id: { type: 'string' } }, required: ['id'], type: 'object' },
    name: 'get_driver',
  },
  {
    description:
      'Read-only. Checks a driver bundle without writing anything (schema, name collisions, template type-check, the ' +
      `project's existing usages, an arduino-cli compile when available) and returns { ok, errors, warnings }. Always run this before set_driver. ${FORMAT}`,
    inputSchema: bundleInput,
    name: 'validate_driver',
  },
  {
    description: `Creates or replaces a driver in this project (project scope) after the full validate_driver checks — nothing is written when it fails (the errors are returned). The project's schemes are rebuilt before this returns, so the new node kinds \`driver-action::<id>::<actionId>\` exist for the next call: call get_node_kinds again before inserting them. If the driver has a \`device\` section, tell the user to add an instance on the Devices document (you cannot edit it). Validate first. ${FORMAT}`,
    inputSchema: bundleInput,
    name: 'set_driver',
  },
];

const summarize = (entry: IDriverToolEntry): Record<string, unknown> => ({
  actions: entry.config.actions.map((action) => ({
    fields: action.fields.map((field) => ({ kind: field.kind, name: field.name })),
    id: action.id,
    label: action.label,
    notes: action.notes,
    resultType: action.resultType,
  })),
  ...(entry.config.device
    ? { device: { fields: entry.config.device.fields.map((field) => ({ kind: field.kind, name: field.name })) } }
    : {}),
  errors: entry.errors,
  id: entry.config.id,
  label: entry.config.label,
  notes: entry.config.notes,
  scope: entry.scope,
  status: entry.status,
});

/**
 * `IAgentToolProvider` for the project's Arduino drivers (ADR 0054 (private) §6): `list_drivers`, `get_driver`,
 * `validate_driver`, `set_driver` (project scope only — no library tools, no delete). Node-safe: everything platform
 * specific lives behind `IDriverToolHost`.
 */
export class DriverToolProvider implements IAgentToolProvider {
  readonly tools = TOOLS;

  private readonly host: IDriverToolHost;

  constructor(host: IDriverToolHost) {
    this.host = host;
  }

  async execute(call: ILlmToolCall): Promise<TToolExecutionResult> {
    try {
      switch (call.name) {
        case 'list_drivers': {
          const entries = await this.host.listDrivers();
          return ok(JSON.stringify(entries.map((entry) => summarize(entry))));
        }
        case 'get_driver': {
          const id = asRecord(call.input)?.id;
          if (typeof id !== 'string') return fail('get_driver: id is required');
          return ok(JSON.stringify(await this.host.getDriver(id)));
        }
        case 'validate_driver':
        case 'set_driver': {
          const params = asRecord(call.input);
          if (!params || !('bundle' in params)) return fail(`${call.name}: bundle is required`);
          const result =
            call.name === 'validate_driver'
              ? await this.host.validateDriver(params.bundle)
              : await this.host.setProjectDriver(params.bundle);
          if (!result.ok) return fail(`${call.name}: ${JSON.stringify(result)}`);
          return ok(JSON.stringify(call.name === 'set_driver' ? { ...result, written: true } : result));
        }
        default: {
          return fail(`Unknown tool: ${call.name}`);
        }
      }
    } catch (error) {
      return fail(`${call.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
