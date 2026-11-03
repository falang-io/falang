import type { IAgentContextProvider } from '@falang/agent';
import { WORKFLOW_DAYJS_LOCALES, WORKFLOW_DAYJS_PLUGINS } from '@falang/workflow-compiler/src/dayjs-runtime.js';

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

/**
 * Adds `WORKFLOW_RUNTIME_NOTE` (and, when the deployment has platform test bots, a note about them) to the system
 * prompt of every workflow agent (chat, JSON files, magic node).
 */
export class WorkflowRuntimeContextProvider implements IAgentContextProvider {
  private readonly getSandboxVendors: () => readonly string[];

  constructor(getSandboxVendors: () => readonly string[] = () => []) {
    this.getSandboxVendors = getSandboxVendors;
  }

  describe = (): string => {
    const sandbox = buildSandboxNote(this.getSandboxVendors());
    return sandbox ? `${WORKFLOW_RUNTIME_NOTE}\n\n${sandbox}` : WORKFLOW_RUNTIME_NOTE;
  };
}

/** Only the test-bot note, for interfaces that carry no runtime note of their own (the code interface). */
export const createSandboxContextProvider = (
  getSandboxVendors: () => readonly string[],
): { describe: () => string } => ({
  describe: () => buildSandboxNote(getSandboxVendors()),
});
