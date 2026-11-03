import type { IAgentContextProvider } from '@falang/agent';
import { WORKFLOW_DAYJS_LOCALES, WORKFLOW_DAYJS_PLUGINS } from '@falang/workflow-compiler/src/dayjs-runtime.js';

/** What every workflow expression can use without an import — the compiled workflows module provides it. */
export const WORKFLOW_RUNTIME_NOTE =
  `Dates: the global \`dayjs\` (day.js) is available in every code field without an import, extended with the ` +
  `plugins ${WORKFLOW_DAYJS_PLUGINS.join(', ')} and the locale${WORKFLOW_DAYJS_LOCALES.length > 1 ? 's' : ''} ` +
  `${WORKFLOW_DAYJS_LOCALES.join(', ')} (e.g. \`dayjs().tz('Europe/Moscow').format('DD.MM.YYYY HH:mm')\`, ` +
  `\`dayjs(text, 'DD.MM.YYYY', true).isValid()\`, \`dayjs().locale('ru').format('D MMMM')\`). Inside a workflow ` +
  '`dayjs()` and `Date.now()` read the workflow clock, so they are safe to use.';

/** Adds `WORKFLOW_RUNTIME_NOTE` to the system prompt of every workflow agent (chat, JSON files, magic node). */
export class WorkflowRuntimeContextProvider implements IAgentContextProvider {
  describe = (): string => WORKFLOW_RUNTIME_NOTE;
}
