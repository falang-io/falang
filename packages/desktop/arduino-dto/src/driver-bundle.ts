import { zod } from '@falang/dto';
import {
  DriverConfigValidationError,
  driverConfigZod,
  parseDriverConfig,
  type IDriverConfig,
} from './driver-config.js';

/**
 * A driver bundle (ADR 0054 (private)) — one JSON document carrying a driver's `driver.config.json` and the
 * text of every file it lists. The transport format of Upload/Download and the agent/MCP driver tools; on
 * disk a driver stays the plain `0023` folder. Zod only, no `node:*`, so a renderer can deep-import it.
 */
export const DRIVER_BUNDLE_FORMAT_VERSION = 1;
export const DRIVER_BUNDLE_FILE_SUFFIX = '.falang-driver.json';
export const DRIVER_BUNDLE_MAX_FILE_BYTES = 256 * 1024;
export const DRIVER_BUNDLE_MAX_TOTAL_BYTES = 1024 * 1024;

const FLAT_FILE_NAME = /^[\w.-]+$/;

const driverBundleZod = zod.object({
  formatVersion: zod.literal(DRIVER_BUNDLE_FORMAT_VERSION),
  config: driverConfigZod,
  /** File name (flat, as listed in `config.sourceFiles` ∪ `config.includes`) → its text. */
  files: zod.record(zod.string(), zod.string()),
});

export interface IDriverBundle {
  readonly formatVersion: 1;
  readonly config: IDriverConfig;
  readonly files: Readonly<Record<string, string>>;
}

/** What an agent/MCP tool shows as the bundle's input format — generated from the zod schema, so it cannot drift. */
export const DRIVER_BUNDLE_JSON_SCHEMA = zod.toJSONSchema(driverBundleZod) as Record<string, unknown>;

export class DriverBundleValidationError extends Error {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    super(messages.join('; '));
    this.name = 'DriverBundleValidationError';
    this.messages = messages;
  }
}

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

/** The file names a config requires — `sourceFiles ∪ includes`. */
export const driverConfigFileNames = (config: IDriverConfig): string[] => [
  ...new Set([...config.sourceFiles, ...config.includes]),
];

/** Parses and validates an unknown value as a driver bundle; throws `DriverBundleValidationError` listing every problem found. */
export const parseDriverBundle = (input: unknown): IDriverBundle => {
  const structural = driverBundleZod.safeParse(input);
  if (!structural.success) {
    throw new DriverBundleValidationError(
      structural.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const messages: string[] = [];
  const { config, files, formatVersion } = structural.data;
  let parsedConfig: IDriverConfig | null = null;
  try {
    parsedConfig = parseDriverConfig(config);
  } catch (error) {
    if (!(error instanceof DriverConfigValidationError)) throw error;
    messages.push(`config: ${error.message}`);
  }

  const names = Object.keys(files);
  for (const name of names) {
    if (!FLAT_FILE_NAME.test(name)) messages.push(`files: "${name}" must be a flat filename with no path separators`);
  }
  if (parsedConfig) {
    const required = new Set(driverConfigFileNames(parsedConfig));
    for (const name of required) if (!(name in files)) messages.push(`files: missing "${name}" (listed in config)`);
    for (const name of names) {
      if (!required.has(name)) messages.push(`files: "${name}" is not listed in config.sourceFiles or config.includes`);
    }
  }
  let total = 0;
  for (const name of names) {
    const bytes = utf8Bytes(files[name]);
    total += bytes;
    if (bytes > DRIVER_BUNDLE_MAX_FILE_BYTES) {
      messages.push(
        `files: "${name}" is ${String(bytes)} bytes, over the ${String(DRIVER_BUNDLE_MAX_FILE_BYTES)} limit`,
      );
    }
  }
  if (total > DRIVER_BUNDLE_MAX_TOTAL_BYTES) {
    messages.push(`files: ${String(total)} bytes in total, over the ${String(DRIVER_BUNDLE_MAX_TOTAL_BYTES)} limit`);
  }
  if (messages.length > 0 || !parsedConfig) throw new DriverBundleValidationError(messages);
  return { formatVersion, config: parsedConfig, files };
};
