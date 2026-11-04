/** The `fetch` subset the managed download needs; Node's global `fetch` and Electron's `net.fetch` both fit. */
export type TManagedFetch = (
  url: string,
  init?: { readonly signal?: AbortSignal; readonly headers?: Record<string, string> },
) => Promise<Response>;

const RELEASE_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

const parseRelease = (version: string): [number, number, number] => {
  const match = RELEASE_PATTERN.exec(version);
  if (!match) throw new Error(`Not a release version: "${version}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

/** Release semver only (`1.5.1`); a pre-release such as `1.5.2-rc.1` throws. Negative, zero or positive like a sort comparator. */
export const compareVersions = (a: string, b: string): number => {
  const left = parseRelease(a);
  const right = parseRelease(b);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

/** `sha256sum` format (`<hex>  <file name>`, the name optionally prefixed with `*`) → lower-case hash per file name. */
export const parseChecksums = (text: string): Map<string, string> => {
  const result = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (match && match[1] && match[2]) result.set(match[2], match[1].toLowerCase());
  }
  return result;
};

/** The release version from GitHub's `releases/latest` JSON (`tag_name` without the `v`); `null` for a draft, a pre-release or anything unusable. */
export const parseLatestRelease = (json: unknown): string | null => {
  if (typeof json !== 'object' || json === null) return null;
  const { tag_name: tag, draft, prerelease } = json as Record<string, unknown>;
  if (draft === true || prerelease === true || typeof tag !== 'string') return null;
  const version = tag.replace(/^v/, '');
  return RELEASE_PATTERN.test(version) ? version : null;
};

const LATEST_RELEASE_URL = 'https://api.github.com/repos/arduino/arduino-cli/releases/latest';

/** Not Arduino's `…_latest_*` redirect: it currently points at a pre-release. */
export const fetchLatestArduinoCliVersion = async (fetchFn: TManagedFetch, signal?: AbortSignal): Promise<string> => {
  const response = await fetchFn(LATEST_RELEASE_URL, {
    ...(signal ? { signal } : {}),
    headers: { 'User-Agent': 'FalangDuino', Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the latest arduino-cli release.`);
  const version = parseLatestRelease(await response.json());
  if (version === null) throw new Error('GitHub returned no usable latest arduino-cli release.');
  return version;
};
