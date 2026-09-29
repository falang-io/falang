import { zod, type IDataInfo, type INodeConfig } from '@falang/dto';

/**
 * A single generic node kind for *any* ActivePieces piece action — deliberately not one node kind
 * per piece/action (contrast `@falang/workflow-integrations-common`'s `buildActionNodeConfig`,
 * which does generate one node kind per `IActionDescriptor`). `pieceName`/`actionName` are picked
 * once, in this node's own editor panel, from a catalog fetched at runtime from the standalone
 * `falang-workflow-activepieces` service (see ADR 0010 (private)) —
 * never re-picked afterward. `propsValue` is a record because the actual set of prop names is only
 * known by that fetched catalog, never by this static schema — every value is raw expression code,
 * same convention as any other `'expression'`-kind field elsewhere in this codebase.
 */
const activepiecesActionDto = zod.object({
  pieceName: zod.string(),
  actionName: zod.string(),
  credentialId: zod.string(),
  propsValue: zod.record(zod.string(), zod.string()),
});

export type TActivepiecesActionData = zod.infer<typeof activepiecesActionDto>;

export const ACTIVEPIECES_ACTION_NAME = 'activepieces-action';

export const activepiecesActionDataType = {
  type: activepiecesActionDto,
  default: () => ({ pieceName: '', actionName: '', credentialId: '', propsValue: {} }),
} as const satisfies IDataInfo;

/** Leaf/action-node shape — no `children`/`childTuple`, same as `buildActionNodeConfig`'s generated output. */
export const activepiecesActionNodesGroup: readonly INodeConfig[] = [
  { name: ACTIVEPIECES_ACTION_NAME, data: activepiecesActionDataType },
];
