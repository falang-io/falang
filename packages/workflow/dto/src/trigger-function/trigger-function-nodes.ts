import { nanoid } from 'nanoid';
import { zod, type IDataInfo, type INode, type INodeConfig } from '@falang/dto';
import { variableInfoZod } from '@falang/typescript-dto';

const stringDataType = {
  type: zod.string(),
  default: () => '',
} as const satisfies IDataInfo;

/**
 * `vendor`/`triggerName` identify which `ITriggerDescriptor` this function is bound to (resolved via
 * `IntegrationsRegistryStore.findTrigger`) — not a child node, unlike a plain function's statements.
 * The descriptor's `scopeType` is what's fixed and non-editable (see ADR 0006's "trigger-function"
 * section); `vendor`/`triggerName` themselves are just a reference, picked once when the trigger
 * function is configured. `credentialId` identifies *which* configured instance of that vendor (e.g.
 * which bot) this function listens to — it's what a vendor's webhook decoder resolves back to this
 * document (see `@falang/workflow-gateway`'s `IWebhookDecoder`).
 *
 * `scopeVariableName`/`scopeType` are a denormalized copy of the resolved `ITriggerDescriptor`'s own
 * fields, baked in at creation time (see `createTriggerFunctionNode`'s callers). This lets the
 * generic, vendor-agnostic scope walker (`@falang/typescript-common`'s `getContainerScopeContribution`)
 * expose the trigger's payload as an in-scope variable for the body's statements purely from this
 * node's own `data` — no lookup service/DI needed there, matching how `function-body` already carries
 * its own `parameters` directly rather than resolving them from elsewhere.
 *
 * `triggerConfig` holds the values of the resolved `ITriggerDescriptor.contextFields`, if any (e.g.
 * Telegram's on-command trigger's `command` name) — keyed by field name, same "baked in at creation
 * time" treatment as `scopeVariableName`/`scopeType` above. Absent for triggers with no `contextFields`.
 */
const triggerFunctionBodyDto = zod.object({
  vendor: zod.string(),
  triggerName: zod.string(),
  credentialId: zod.string(),
  scopeVariableName: zod.string(),
  scopeType: variableInfoZod,
  returnValue: variableInfoZod.optional(),
  triggerConfig: zod.record(zod.string(), zod.string()).optional(),
});

export type TTriggerFunctionBodyData = zod.infer<typeof triggerFunctionBodyDto>;

const DEFAULT_SCOPE_TYPE: zod.infer<typeof variableInfoZod> = { type: 'any' };

export const triggerFunctionBodyDataType = {
  type: triggerFunctionBodyDto,
  default: () => ({
    vendor: '',
    triggerName: '',
    credentialId: '',
    scopeVariableName: '',
    scopeType: DEFAULT_SCOPE_TYPE,
  }),
} as const satisfies IDataInfo;

export const TRIGGER_FUNCTION_NAME = 'trigger-function';
export const TRIGGER_FUNCTION_BODY_NAME = 'trigger-function-body';

/**
 * Builds a `trigger-function` root node with the given `trigger-function-body` data baked in —
 * used by the editor's "New trigger" flow (vendor/trigger/credential picked up front in a form),
 * unlike a plain `function`/`objects-structure` document whose root is only created lazily from
 * `NodesStack.factory()`'s all-blank default on first open (see `WorkflowStore.createTriggerFunctionDocument`).
 */
export const createTriggerFunctionNode = (bodyData: TTriggerFunctionBodyData): INode => ({
  id: nanoid(),
  name: TRIGGER_FUNCTION_NAME,
  children: [
    { id: nanoid(), name: 'function-header', data: stringDataType.default() },
    { id: nanoid(), name: TRIGGER_FUNCTION_BODY_NAME, children: [], data: bodyData },
    { id: nanoid(), name: 'function-footer', data: stringDataType.default() },
  ],
});

const buildTriggerFunctionNode = (): INode => createTriggerFunctionNode(triggerFunctionBodyDataType.default());

/**
 * Same shape as a plain `function` (`functionCfg` in `@falang/dto`) — reuses the existing
 * `function-header`/`function-footer` node kinds verbatim (both stacks must register `functionNodesGroup`
 * alongside this one) — except its body is `trigger-function-body`, not `function-body`: which trigger
 * this function is bound to is `vendor`/`triggerName` *data* on the body node itself, not a child node —
 * there's no fixed/protected first child to worry about deleting or moving (see ADR 0006's
 * "trigger-function" section for why this replaced an earlier fixed-child-node design). The body's
 * children are an ordinary, fully editable statement list, exactly like `function-body`'s.
 */
export const triggerFunctionNodesGroup: readonly INodeConfig[] = [
  {
    name: TRIGGER_FUNCTION_NAME,
    documentRootOnly: true,
    childTuple: ['function-header', TRIGGER_FUNCTION_BODY_NAME, 'function-footer'],
    factory: buildTriggerFunctionNode,
  },
  {
    name: TRIGGER_FUNCTION_BODY_NAME,
    data: triggerFunctionBodyDataType,
    children: true,
  },
];
