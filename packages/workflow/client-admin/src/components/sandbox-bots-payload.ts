export const SANDBOX_COMMAND_PATTERN = /^[a-z0-9_]{1,32}$/;
export const SANDBOX_TTL_MIN = 1;
export const SANDBOX_TTL_MAX = 10_080;

export const isValidCommandName = (value: string): boolean => SANDBOX_COMMAND_PATTERN.test(value.trim());

export const isValidTtl = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= SANDBOX_TTL_MIN && value <= SANDBOX_TTL_MAX;

/** Human form of a TTL in minutes: `15 min`, `2 h`, `1 d 2 h`. */
export const formatTtl = (minutes: number): string => {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [days ? `${days} d` : '', hours ? `${hours} h` : '', mins ? `${mins} min` : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0 min';
};

export interface ISandboxPlatformFormValues {
  token: string;
  commandName: string;
}

/** Builds the `PUT` body: a blank token is omitted (keeps the stored one), the command name is trimmed. */
export const buildSandboxPlatformPayload = (
  values: ISandboxPlatformFormValues,
): { token?: string; commandName: string } => {
  const token = values.token.trim();
  const commandName = values.commandName.trim();
  return token ? { token, commandName } : { commandName };
};

const PLATFORM_NAMES: Readonly<Record<string, string>> = { telegram: 'Telegram', max: 'MAX', vk: 'VK' };

/** Brand name of a platform for display; an unknown vendor id is shown as is. */
export const platformDisplayName = (vendor: string): string => PLATFORM_NAMES[vendor] ?? vendor;
