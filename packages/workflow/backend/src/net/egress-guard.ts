import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import type { IBackendEgress } from '@falang/workflow-integrations-common';
import { Agent, fetch as undiciFetch } from 'undici';

/**
 * SSRF guard for every outbound connection the backend (not a runner pod) opens to an address that came
 * from tenant data — `loadOptions` of a vendor (e.g. OpenAI `baseUrl`), "Sync structure" for the SQL
 * vendors, and so on. Names are resolved here, every returned address is classified, and the socket is
 * then opened to the *checked* address (undici `connect.lookup` / a substituted host for `pg`/`mysql2`),
 * so a second, different DNS answer ("DNS rebinding") can never reach the connection.
 *
 * Self-host / e2e escape hatches (default: everything non-public is refused):
 *  - `EGRESS_ALLOW_PRIVATE=true` — no address restriction at all;
 *  - `EGRESS_ALLOWED_CIDRS=10.0.0.0/8,172.18.0.0/16` — these ranges are additionally allowed.
 */
export class EgressBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EgressBlockedError';
  }
}

export interface IEgressPolicy {
  readonly allowPrivate: boolean;
  readonly allowed: BlockList;
}

/*
 * Blocked IPv4 ranges: "this network" 0/8, RFC1918 (10/8, 172.16/12, 192.168/16), CGNAT 100.64/10, loopback
 * 127/8, link-local 169.254/16 (incl. the cloud metadata address 169.254.169.254), IETF assignments 192.0.0/24,
 * benchmarking 198.18/15, multicast 224/4 and reserved/broadcast 240/4.
 */
const IPV4_BLOCKED: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

/*
 * Blocked IPv6 ranges: ::/96 (unspecified, loopback, deprecated IPv4-compatible), ::ffff:0:0/96 (IPv4-mapped — could
 * smuggle a private v4 address), NAT64 64:ff9b::/96, discard 100::/64, documentation 2001:db8::/32, unique local
 * fc00::/7, link-local fe80::/10 and multicast ff00::/8.
 */
const IPV6_BLOCKED: readonly (readonly [string, number])[] = [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

// Two separate lists: Node's BlockList treats an IPv4 address as an IPv4-mapped IPv6 one, so a single list with
// `::/96`-style IPv6 rules would also match every public IPv4 address.
const blockedV4 = ((): BlockList => {
  const list = new BlockList();
  for (const [network, prefix] of IPV4_BLOCKED) list.addSubnet(network, prefix, 'ipv4');
  return list;
})();
const blockedV6 = ((): BlockList => {
  const list = new BlockList();
  for (const [network, prefix] of IPV6_BLOCKED) list.addSubnet(network, prefix, 'ipv6');
  return list;
})();

/** `null` for a publicly routable address, otherwise a short human-readable reason. */
export const classifyIp = (address: string): string | null => {
  const family = isIP(address);
  if (family === 0) return `"${address}" is not an IP address`;
  const blocked = family === 4 ? blockedV4.check(address, 'ipv4') : blockedV6.check(address, 'ipv6');
  return blocked ? `address ${address} is in a private, loopback, link-local or otherwise reserved range` : null;
};

const parseCidrs = (raw: string): BlockList => {
  const list = new BlockList();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [address = '', prefixText = ''] = trimmed.split('/');
    const family = isIP(address);
    if (family === 0) throw new Error(`EGRESS_ALLOWED_CIDRS: "${trimmed}" is not an IP or CIDR`);
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefixText === '') {
      list.addAddress(address, type);
      continue;
    }
    const prefix = Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) {
      throw new Error(`EGRESS_ALLOWED_CIDRS: "${trimmed}" has an invalid prefix length`);
    }
    list.addSubnet(address, prefix, type);
  }
  return list;
};

/** Read from the environment on every call (cheap), so a live flag change/test override is honoured. */
export const loadEgressPolicy = (env: NodeJS.ProcessEnv = process.env): IEgressPolicy => ({
  allowPrivate: env.EGRESS_ALLOW_PRIVATE === 'true',
  allowed: parseCidrs(env.EGRESS_ALLOWED_CIDRS ?? ''),
});

export const isAddressAllowed = (address: string, policy: IEgressPolicy): boolean => {
  if (policy.allowPrivate) return true;
  if (classifyIp(address) === null) return true;
  const family = isIP(address);
  return family !== 0 && policy.allowed.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

export type TLookupAll = (hostname: string) => Promise<readonly LookupAddress[]>;

const systemLookupAll: TLookupAll = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });

/** Resolves `host` (a name or an IP literal), refuses it unless *every* answer is allowed, returns one checked address. */
export const resolveSafeAddress = async (
  host: string,
  policy: IEgressPolicy = loadEgressPolicy(),
  lookupAll: TLookupAll = systemLookupAll,
): Promise<LookupAddress> => {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const addresses = isIP(bare) === 0 ? await lookupAll(bare) : [{ address: bare, family: isIP(bare) }];
  if (addresses.length === 0) throw new EgressBlockedError(`Host "${host}" did not resolve to any address`);
  for (const { address } of addresses) {
    if (!isAddressAllowed(address, policy)) {
      throw new EgressBlockedError(`Host "${host}" is not allowed: ${classifyIp(address) ?? 'not permitted'}`);
    }
  }
  const [first] = addresses;
  return first as LookupAddress;
};

type TLookupCallback = (error: Error | null, address: string | LookupAddress[], family?: number) => void;

/** A `net`-style `lookup` (undici `connect.lookup`, `net.connect({ lookup })`) that only ever hands out checked addresses. */
export const createGuardedLookup =
  (policy: () => IEgressPolicy = loadEgressPolicy, lookupAll: TLookupAll = systemLookupAll) =>
  (hostname: string, options: { all?: boolean } | number | undefined, callback: TLookupCallback): void => {
    const wantsAll = typeof options === 'object' && options !== null && options.all === true;
    const effectivePolicy = policy();
    const bare = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
    const run = async (): Promise<LookupAddress[]> => {
      const addresses = isIP(bare) === 0 ? await lookupAll(bare) : [{ address: bare, family: isIP(bare) }];
      if (addresses.length === 0) throw new EgressBlockedError(`Host "${hostname}" did not resolve to any address`);
      for (const { address } of addresses) {
        if (!isAddressAllowed(address, effectivePolicy)) {
          throw new EgressBlockedError(`Host "${hostname}" is not allowed: ${classifyIp(address) ?? 'not permitted'}`);
        }
      }
      return [...addresses];
    };
    run().then(
      (addresses) => {
        if (wantsAll) callback(null, addresses);
        else callback(null, addresses[0]?.address ?? '', addresses[0]?.family);
      },
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), ''),
    );
  };

export const EGRESS_CONNECT_TIMEOUT_MS = 10_000;
export const EGRESS_REQUEST_TIMEOUT_MS = 30_000;

export interface ICreateEgressOptions {
  readonly policy?: () => IEgressPolicy;
  readonly lookupAll?: TLookupAll;
}

/** The `IBackendEgress` handed to vendor hooks (`loadOptions`, `syncVendorData`). */
export const createBackendEgress = (options: ICreateEgressOptions = {}): IBackendEgress => {
  const policy = options.policy ?? loadEgressPolicy;
  const lookupAll = options.lookupAll ?? systemLookupAll;
  const dispatcher = new Agent({
    connect: { timeout: EGRESS_CONNECT_TIMEOUT_MS, lookup: createGuardedLookup(policy, lookupAll) as never },
    headersTimeout: EGRESS_REQUEST_TIMEOUT_MS,
    bodyTimeout: EGRESS_REQUEST_TIMEOUT_MS,
  });
  return {
    fetch: async (url, init) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new EgressBlockedError(`Protocol "${parsed.protocol}" is not allowed`);
      }
      // IP literals never go through `connect.lookup` (the socket layer skips DNS for them), so check them here.
      if (isIP(parsed.hostname.replaceAll(/^\[|\]$/g, '')) !== 0)
        await resolveSafeAddress(parsed.hostname, policy(), lookupAll);
      // Redirects are never followed: the target of a redirect would bypass the pre-connect checks of the first hop's intent.
      const response = await undiciFetch(url, { ...(init as object), dispatcher, redirect: 'manual' });
      if (response.status >= 300 && response.status < 400) {
        throw new EgressBlockedError(`Redirects are not followed (got ${response.status} from ${parsed.host})`);
      }
      return response as unknown as Response;
    },
    resolveHost: async (host) => {
      const resolved = await resolveSafeAddress(host, policy(), lookupAll);
      return resolved.address;
    },
  };
};

let sharedEgress: IBackendEgress | null = null;

/** Process-wide instance (one undici `Agent`); the policy is still read from the env on every connection. */
export const getBackendEgress = (): IBackendEgress => {
  sharedEgress ??= createBackendEgress();
  return sharedEgress;
};
