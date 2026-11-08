import type { IAgentContextProvider } from '@falang/agent';
import { WORKFLOW_DAYJS_LOCALES, WORKFLOW_DAYJS_PLUGINS } from '@falang/workflow-compiler/src/dayjs-runtime.js';
import { CONSTANTS_DOCUMENT_TYPE, readConstants, type IWorkflowConstant } from '@falang/workflow-dto';
import type { WorkflowDocument } from '../workflow-types.js';

/** What every workflow expression can use without an import — the compiled workflows module provides it. */
export const WORKFLOW_RUNTIME_NOTE =
  `Dates: the global \`dayjs\` (day.js) is available in every code field without an import, extended with the ` +
  `plugins ${WORKFLOW_DAYJS_PLUGINS.join(', ')} and the locale${WORKFLOW_DAYJS_LOCALES.length > 1 ? 's' : ''} ` +
  `${WORKFLOW_DAYJS_LOCALES.join(', ')} (e.g. \`dayjs().tz('Europe/Moscow').format('DD.MM.YYYY HH:mm')\`, ` +
  `\`dayjs(text, 'DD.MM.YYYY', true).isValid()\`, \`dayjs().locale('ru').format('D MMMM')\`). Inside a workflow ` +
  '`dayjs()` and `Date.now()` read the workflow clock, so they are safe to use.';

/** Tells the agent about the platform test bots (ADR 0073 (private)); empty when the deployment has none. */
export const buildSandboxNote = (vendors: readonly string[]): string =>
  vendors.length === 0
    ? ''
    : `This deployment has a platform test bot for: ${vendors.join(', ')}. When the user wants to try a messenger ` +
      'bot on the dev stand and has no bot token yet, create the instance with devSandbox: true and leave the ' +
      'token fields empty; after finishing, tell the user to open the integration and press "Connect a chat" to ' +
      "link their chat. Prod always needs the user's own bot token.";

/** The project's constants, read from its pinned `constants` document (none when absent or malformed). */
export const projectConstantsOf = (store: {
  readonly documents: readonly WorkflowDocument[];
}): readonly IWorkflowConstant[] =>
  readConstants(store.documents.find((doc) => doc.type === CONSTANTS_DOCUMENT_TYPE)?.customData ?? null);

/**
 * Tells the agent which project constants exist (names and types only — `list_constants` shows values); a short hint
 * when there are none. `canEdit`: the session has `set_constants` (else the agent asks the user).
 */
export const buildConstantsNote = (constants: readonly IWorkflowConstant[], canEdit = false): string => {
  const head =
    'Project constants: global read-only identifiers in UPPER_SNAKE_CASE, usable by name in every code field ' +
    'without an import; the dev stand gets their dev value, a published version their prod value.';
  const tail = canEdit
    ? 'For a value that differs between the test stand and production or that the user will want to change ' +
      'without editing the scheme (a URL, a chat id, a price, a limit), create a constant with set_constants and ' +
      'use it by name instead of a literal. Never store secrets (tokens, passwords) in constants.'
    : 'You cannot create or change constants here — when a new configurable value is needed (a URL, an id, a ' +
      'limit), tell the user to add it in the "Constants" document and then use it by name.';
  if (constants.length === 0) return `${head} The project has none yet. ${tail}`;
  const list = constants.map((constant) => `${constant.name}: ${constant.type}`).join(', ');
  return `${head} Defined: ${list}. ${tail}`;
};

/**
 * Adds `WORKFLOW_RUNTIME_NOTE`, the project's constants and (when the deployment has platform test bots) a note about
 * them to the system prompt of every workflow agent (chat, JSON files, magic node).
 */
export class WorkflowRuntimeContextProvider implements IAgentContextProvider {
  private readonly getSandboxVendors: () => readonly string[];
  private readonly getConstants: () => readonly IWorkflowConstant[];
  private readonly canEditConstants: boolean;

  constructor(
    getSandboxVendors: () => readonly string[] = () => [],
    getConstants: () => readonly IWorkflowConstant[] = () => [],
    canEditConstants = false,
  ) {
    this.getSandboxVendors = getSandboxVendors;
    this.getConstants = getConstants;
    this.canEditConstants = canEditConstants;
  }

  describe = (): string => {
    const sandbox = buildSandboxNote(this.getSandboxVendors());
    return [WORKFLOW_RUNTIME_NOTE, buildConstantsNote(this.getConstants(), this.canEditConstants), sandbox]
      .filter(Boolean)
      .join('\n\n');
  };
}

/** Only the test-bot note, for interfaces that carry no runtime note of their own (the code interface). */
export const createSandboxContextProvider = (
  getSandboxVendors: () => readonly string[],
): { describe: () => string } => ({
  describe: () => buildSandboxNote(getSandboxVendors()),
});
