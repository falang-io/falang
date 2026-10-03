import { Agent, Dispatcher, ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import type { IEgressRoutingOptions } from './types.js';
import { getEgressVendor } from './vendor-context.js';

// oxlint-disable-next-line no-empty-function -- swallow errors of fire-and-forget closes
const noop = (): void => {};

let activeOptions: IEgressRoutingOptions | null = null;

/**
 * `true` when a request to `url` made right now (inside the current `runWithEgressVendor` scope) would be sent through the
 * egress proxy by the installed routing. Lets an address guard that opens its own sockets (`backend`'s `getBackendEgress()`)
 * hand such a request to the global dispatcher instead of a direct agent, so the proxy is not bypassed.
 */
export const wouldProxyRequest = (url: URL): boolean => {
  const config = activeOptions?.getConfig();
  if (!config) return false;
  const vendor = getEgressVendor();
  if (!vendor || !config.vendors.includes(vendor)) return false;
  return !activeOptions?.isInternal?.(url);
};

/**
 * Routes each request either to a shared direct `Agent` or to a `ProxyAgent` cached per `(url, token)`.
 * A request is proxied iff a config exists, the current vendor is in `config.vendors` and the target isn't internal.
 */
class EgressDispatcher extends Dispatcher {
  private readonly direct = new Agent();
  private proxyKey: string | null = null;
  private proxyAgent: ProxyAgent | null = null;

  private readonly options: IEgressRoutingOptions;

  constructor(options: IEgressRoutingOptions) {
    super();
    this.options = options;
  }

  private pickProxy(url: URL): ProxyAgent | null {
    const config = this.options.getConfig();
    if (!config) return null;
    const vendor = getEgressVendor();
    if (!vendor || !config.vendors.includes(vendor)) return null;
    if (this.options.isInternal?.(url)) return null;
    const key = `${config.url}\n${config.token}`;
    if (this.proxyKey !== key) {
      const stale = this.proxyAgent;
      this.proxyAgent = new ProxyAgent({ uri: config.url, token: `Bearer ${config.token}` });
      this.proxyKey = key;
      // oxlint-disable-next-line no-void -- fire-and-forget close of the replaced agent
      if (stale) void stale.close().catch(noop);
    }
    return this.proxyAgent;
  }

  // The handler type differs between the npm undici and Node's bundled one; we only forward it untouched.
  dispatch(opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    let target: Dispatcher = this.direct;
    try {
      const origin = typeof opts.origin === 'string' ? opts.origin : opts.origin?.toString();
      if (origin) target = this.pickProxy(new URL(opts.path, origin)) ?? this.direct;
    } catch {
      target = this.direct;
    }
    return target.dispatch(opts, handler);
  }

  async close(): Promise<void> {
    const proxy = this.proxyAgent;
    this.proxyAgent = null;
    this.proxyKey = null;
    await Promise.all([this.direct.close(), proxy?.close()]);
  }

  async destroy(): Promise<void> {
    const proxy = this.proxyAgent;
    this.proxyAgent = null;
    this.proxyKey = null;
    await Promise.all([this.direct.destroy(), proxy?.destroy()]);
  }
}

export const createEgressDispatcher = (options: IEgressRoutingOptions): Dispatcher => new EgressDispatcher(options);

/** Installs the dispatcher as the process-global one (what Node's built-in `fetch` uses). */
export const installEgressRouting = (options: IEgressRoutingOptions): { dispose(): void } => {
  const previous = getGlobalDispatcher();
  const dispatcher = createEgressDispatcher(options);
  setGlobalDispatcher(dispatcher);
  activeOptions = options;
  return {
    dispose: () => {
      if (activeOptions === options) activeOptions = null;
      setGlobalDispatcher(previous);
      // oxlint-disable-next-line no-void -- fire-and-forget close
      void dispatcher.close().catch(noop);
    },
  };
};
