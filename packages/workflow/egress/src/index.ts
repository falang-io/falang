export { runWithEgressVendor, getEgressVendor } from './vendor-context.js';
export { createEgressDispatcher, installEgressRouting } from './egress-dispatcher.js';
export { createInternalOriginMatcher } from './internal-origin.js';
export { createEgressConfigPoller, type IEgressConfigPoller } from './config-poller.js';
export { fetchEgressProxyConfig } from './fetch-config.js';
export type { IEgressProxyConfig, IEgressRoutingOptions } from './types.js';
