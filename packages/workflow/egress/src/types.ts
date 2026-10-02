export interface IEgressProxyConfig {
  url: string;
  token: string;
  vendors: readonly string[];
}

export interface IEgressRoutingOptions {
  /** Synchronous: hosts keep a refreshed copy in memory (see `createEgressConfigPoller`). */
  getConfig: () => IEgressProxyConfig | null;
  /** Origins that must never be proxied (backend, artifact server, sibling services). */
  isInternal?: (url: URL) => boolean;
}
