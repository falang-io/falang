import { ExecutionType } from '@activepieces/shared';
import type { ActionContext, PropertyContext, Store } from '@activepieces/pieces-framework';

const notImplemented =
  <T>(feature: string): (() => T) =>
  () => {
    throw new Error(`${feature} is not supported by falang-workflow-activepieces (actions-only v1)`);
  };

/**
 * Builds ActivePieces' `ActionContext` for a synchronous, one-shot action run. This service only
 * runs actions (no triggers, no resumable waitpoints — see ADR 0010's scope), so only the fields an
 * allow-listed action actually touches (`propsValue`, `auth`) are meaningfully implemented; every
 * other structurally-required field is a safe stub that throws/no-ops if some future action ever
 * calls it. Cast at the end rather than satisfied field-by-field against `ActionContext`'s full
 * generic shape, since that shape is designed for the full ActivePieces runtime (waitpoints, AI
 * agent tools, flow introspection) this MVP deliberately doesn't implement. `authValue` is already
 * shaped correctly per the piece's auth type (see `resolveAuthValue`) — this function just plugs it
 * in, it doesn't know or care whether it's SecretText/BasicAuth/CustomAuth shaped.
 */
export const buildActionContext = (propsValue: Record<string, unknown>, authValue: unknown): ActionContext => {
  const context = {
    executionType: ExecutionType.BEGIN,
    propsValue,
    auth: authValue,
    flows: { list: notImplemented('flows.list'), current: { id: '', version: { id: '' } } },
    step: { name: '' },
    store: {
      get: async <T>(): Promise<T | null> => null,
      put: async <T>(_key: string, value: T): Promise<T> => value,
      delete: async (): Promise<void> => {},
    },
    project: { id: '', externalId: async (): Promise<undefined> => undefined },
    connections: { get: async (): Promise<null> => null },
    tags: { add: async (): Promise<void> => {} },
    server: { apiUrl: '', publicUrl: '', token: '' },
    files: { write: notImplemented('files.write') },
    output: { update: async (): Promise<void> => {} },
    agent: { tools: notImplemented('agent.tools') },
    run: {
      id: '',
      stop: () => {},
      respond: () => {},
      createWaitpoint: notImplemented('createWaitpoint'),
      waitForWaitpoint: notImplemented('waitForWaitpoint'),
    },
  };
  return context as unknown as ActionContext;
};

/** Backs a `POLLING` trigger's `context.store` with a plain in-memory `Map` — see `routes/poll.ts` for how that map's lifetime is scoped (one per `credentialId`/`pieceName`/`triggerName`, kept for the service process's lifetime). */
export const createTriggerStore = (state: Map<string, unknown>): Store => ({
  get: async <T>(key: string): Promise<T | null> => (state.has(key) ? (state.get(key) as T) : null),
  put: async <T>(key: string, value: T): Promise<T> => {
    state.set(key, value);
    return value;
  },
  delete: async (key: string): Promise<void> => {
    state.delete(key);
  },
});

/**
 * Builds the context passed to a `POLLING` trigger's `onEnable`/`run` (see ADR 0011). Only the
 * fields a `POLLING` trigger's hooks structurally read are meaningfully implemented (`propsValue`,
 * `auth`, `store`) — everything else is a safe stub, same "cast at the end" approach as
 * `buildActionContext` above. Callers cast the result to whatever exact parameter type the specific
 * `trigger.onEnable`/`trigger.run` call site expects (its generic instantiation isn't known until a
 * concrete `Trigger` is loaded from the registry).
 */
export const buildTriggerContext = (propsValue: Record<string, unknown>, authValue: unknown, store: Store) => {
  const context = {
    auth: authValue,
    propsValue,
    store,
    project: { id: '', externalId: async (): Promise<undefined> => undefined },
    connections: { get: async (): Promise<null> => null },
    flows: { list: notImplemented('flows.list'), current: { id: '', version: { id: '' } } },
    step: { name: '' },
    server: { apiUrl: '', publicUrl: '', token: '' },
    files: { write: notImplemented('files.write') },
    setSchedule: () => {},
  };
  return context;
};

/** Builds the `PropertyContext` a `Property.Dropdown`/`Property.MultiSelectDropdown`'s dynamic
 * `options()` resolver takes as its second argument — see `routes/options.ts`. Same "cast at the
 * end, stub what's structurally unreachable" approach as the contexts above. */
export const buildPropertyContext = (searchValue?: string): PropertyContext => {
  const context = {
    server: { apiUrl: '', publicUrl: '', token: '' },
    project: { id: '', externalId: async (): Promise<undefined> => undefined },
    searchValue,
    flows: { list: notImplemented('flows.list'), current: { id: '', version: { id: '' } } },
    connections: { get: async (): Promise<null> => null },
  };
  return context as unknown as PropertyContext;
};
