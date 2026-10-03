import type { IEgressProxyConfig, IEgressRoutingOptions } from './types.js';
import { getEgressVendor } from './vendor-context.js';

/**
 * The one routing decision shared by the undici dispatcher (fetch) and the `http`/`https` agents (axios):
 * proxy iff a config exists, the current vendor is listed in it and the target isn't internal.
 */
export const pickEgressProxy = (options: IEgressRoutingOptions, target: URL): IEgressProxyConfig | null => {
  const config = options.getConfig();
  if (!config) return null;
  const vendor = getEgressVendor();
  if (!vendor || !config.vendors.includes(vendor)) return null;
  if (options.isInternal?.(target)) return null;
  return config;
};
