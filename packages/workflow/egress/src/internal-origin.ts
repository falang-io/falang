const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

const originKey = (url: URL): string =>
  `${url.protocol}//${url.hostname}:${url.port || DEFAULT_PORTS[url.protocol] || ''}`;

/**
 * Matches URLs by protocol + host + port (default ports normalised). Undefined or unparsable entries are ignored, so
 * hosts can pass optional env values straight in.
 */
export const createInternalOriginMatcher = (urls: readonly (string | undefined)[]): ((url: URL) => boolean) => {
  const origins = new Set<string>();
  for (const raw of urls) {
    if (!raw) continue;
    try {
      origins.add(originKey(new URL(raw)));
    } catch {
      // ignore invalid entries
    }
  }
  return (url) => origins.has(originKey(url));
};
