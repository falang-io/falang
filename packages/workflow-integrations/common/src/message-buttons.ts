/**
 * Buttons under an outgoing messenger message — the `buttons` field kind (see `TIntegrationFieldKind`) used by the
 * "send message with buttons" actions of Telegram, MAX and VK. A button either opens a URL or runs a bot command:
 * pressing a command button acts as if the user had sent that command, so the vendor's on-command trigger handles it
 * (the backend turns the press into a `/command` message, see `decodeButtonCommand`). The message itself never waits
 * for a press — unlike a question node.
 *
 * Stored in node `data` as a JSON string (node data is `Record<string, string>`, same as a `result-type` field):
 * `[{"kind":"url","text":"Site","value":"https://example.com"},{"kind":"command","text":"Help","value":"/help"}]`.
 * `text` and `value` are template-literal bodies (`${expr}` allowed), compiled like a `template-string` field.
 */
export type TMessageButtonKind = 'url' | 'command';

export const MESSAGE_BUTTON_KINDS: readonly TMessageButtonKind[] = ['url', 'command'];

export interface IMessageButton {
  readonly kind: TMessageButtonKind;
  /** The button caption — a template-literal body. */
  readonly text: string;
  /** `url`: the address to open; `command`: the command, e.g. `/help` or `/buy ${item.id}` — a template-literal body. */
  readonly value: string;
}

/** At most this many buttons per message — VK's inline keyboard holds 10, the others more. One button per row. */
export const MAX_MESSAGE_BUTTONS = 10;

/**
 * Prefix of a command button's callback data (Telegram `callback_data`, MAX `payload`). It tells a command press apart
 * from a question answer, whose callback data is the option's own label — a label may well start with `/`.
 */
export const MESSAGE_BUTTON_COMMAND_PREFIX = 'falang-cmd:';

/**
 * One compiled button as a TypeScript type — inlined into every `activitySignature` (that text is spliced into
 * `workflows.ts`, which imports no vendor package; same reason as the files package's inlined `File` shape).
 */
export const MESSAGE_BUTTON_TS_TYPE = '{ kind: string; text: string; value: string }';

export interface IParsedMessageButtons {
  readonly buttons: readonly IMessageButton[];
  /** Set when the stored value is not a valid button list; `buttons` is then empty. */
  readonly error?: string;
}

const isKind = (value: unknown): value is TMessageButtonKind =>
  typeof value === 'string' && (MESSAGE_BUTTON_KINDS as readonly string[]).includes(value);

const parseButton = (item: unknown, index: number): IMessageButton | string => {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return `button ${index + 1} is not an object`;
  const record = item as Record<string, unknown>;
  if (!isKind(record.kind)) return `button ${index + 1}: "kind" must be "url" or "command"`;
  if (typeof record.text !== 'string') return `button ${index + 1}: "text" must be a string`;
  const value = record.value ?? '';
  if (typeof value !== 'string') return `button ${index + 1}: "value" must be a string`;
  return { kind: record.kind, text: record.text, value };
};

/** Reads a stored `buttons` value. An empty string is an empty list; anything malformed reports `error`. */
const parseJson = (
  raw: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string } => {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const parseMessageButtons = (raw: string): IParsedMessageButtons => {
  if (raw.trim() === '') return { buttons: [] };
  const json = parseJson(raw);
  if (!json.ok) return { buttons: [], error: `Buttons are not valid JSON: ${json.error}` };
  const parsed = json.value;
  if (!Array.isArray(parsed)) return { buttons: [], error: 'Buttons must be a JSON array' };
  if (parsed.length > MAX_MESSAGE_BUTTONS) {
    return { buttons: [], error: `At most ${MAX_MESSAGE_BUTTONS} buttons are allowed, got ${parsed.length}` };
  }
  const buttons: IMessageButton[] = [];
  for (const [index, item] of parsed.entries()) {
    const button = parseButton(item, index);
    if (typeof button === 'string') return { buttons: [], error: `Invalid buttons: ${button}` };
    buttons.push(button);
  }
  return { buttons };
};

export const serializeMessageButtons = (buttons: readonly IMessageButton[]): string =>
  JSON.stringify(buttons.map(({ kind, text, value }) => ({ kind, text, value })));

/** `start`, ` /start `, `/buy 42` → `/start`, `/start`, `/buy 42`; empty stays empty. */
export const normalizeButtonCommand = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

/** The command a pressed button carries (`falang-cmd:/help` → `/help`), or `undefined` for any other callback data. */
export const decodeButtonCommand = (data: unknown): string | undefined => {
  if (typeof data !== 'string' || !data.startsWith(MESSAGE_BUTTON_COMMAND_PREFIX)) return;
  const command = normalizeButtonCommand(data.slice(MESSAGE_BUTTON_COMMAND_PREFIX.length));
  if (command) return command;
};

/**
 * TypeScript source of a runtime helper `<name>(buttons)` for a vendor's `sharedActivityCode`: trims every button,
 * normalizes a command to a leading `/`, and throws a readable error on an empty caption, URL or command (a
 * `${expr}` that evaluated to nothing). The name is the vendor's own — several vendors' code shares one module.
 */
export const buildPrepareButtonsActivityCode = (name: string): string =>
  [
    `const ${name} = (buttons: readonly ${MESSAGE_BUTTON_TS_TYPE}[]): { kind: 'url' | 'command'; text: string; value: string }[] =>`,
    '  buttons.map((button, index) => {',
    '    const text = button.text.trim();',
    '    if (!text) throw new Error(`Button ${index + 1} has an empty text`);',
    "    if (button.kind === 'url') {",
    '      const url = button.value.trim();',
    '      if (!url) throw new Error(`Button ${index + 1} ("${text}") has an empty URL`);',
    "      return { kind: 'url' as const, text, value: url };",
    '    }',
    '    const command = button.value.trim();',
    '    if (!command) throw new Error(`Button ${index + 1} ("${text}") has an empty command`);',
    "    return { kind: 'command' as const, text, value: command.startsWith('/') ? command : `/${command}` };",
    '  });',
  ].join('\n');
