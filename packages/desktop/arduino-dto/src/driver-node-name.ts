/**
 * One node kind per (driver, action) pair — see `driver-config.ts`'s doc comment for why this replaced
 * this ADR's originally-stated single generic `driver-action` node name. `::` is safe inside a node
 * name (verified: `@falang/dto`/`@falang/scheme` only ever use `INodeConfig.name` as a `Map`/object key
 * or inside error/tooltip text, never parsed into a CSS class/DOM id), and neither `driverId` nor
 * `actionId` can themselves contain `:` (both are kebab-case, see `driver-config.ts`), so the split
 * below is unambiguous.
 */
export const DRIVER_ACTION_NODE_PREFIX = 'driver-action';

export const buildDriverActionNodeName = (driverId: string, actionId: string): string =>
  `${DRIVER_ACTION_NODE_PREFIX}::${driverId}::${actionId}`;

export interface IParsedDriverActionNodeName {
  readonly driverId: string;
  readonly actionId: string;
}

export const parseDriverActionNodeName = (name: string): IParsedDriverActionNodeName | null => {
  const parts = name.split('::');
  if (parts.length !== 3 || parts[0] !== DRIVER_ACTION_NODE_PREFIX) return null;
  return { driverId: parts[1], actionId: parts[2] };
};
