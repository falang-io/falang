import { runWithEgressVendor } from '@falang/workflow-egress';

type TActivityFn = (...args: unknown[]) => unknown;

/**
 * Builds the object passed to `Worker.create({ activities })` from a loaded compiled activities module: drops every
 * `__falang*` metadata export (e.g. `__falangActivityVendors`, activity name -> vendor, emitted by
 * `@falang/workflow-compiler`) and runs each vendor activity inside `runWithEgressVendor` so its outbound HTTP can be
 * routed through that vendor's egress proxy. Other exports are kept as-is.
 */
export const wrapActivitiesWithEgressVendor = (loaded: object): Record<string, unknown> => {
  const exports = loaded as Record<string, unknown>;
  const vendors = (exports.__falangActivityVendors ?? {}) as Record<string, string>;
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(exports)) {
    if (name.startsWith('__falang')) continue;
    const vendor = vendors[name];
    if (typeof value === 'function' && typeof vendor === 'string') {
      const fn = value as TActivityFn;
      result[name] = (...args: unknown[]) => runWithEgressVendor(vendor, () => fn(...args));
    } else {
      result[name] = value;
    }
  }
  return result;
};
