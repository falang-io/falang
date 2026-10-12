/**
 * The project list's "What automation do you want to build?" box hands its text to the project it just created:
 * the prompt waits here (in memory — the hand-off is one in-page navigation, never a reload) until that project's
 * `WorkflowStore` has loaded and takes it, once.
 */
const pendingPrompts = new Map<string, string>();

export const setInitialAgentPrompt = (projectId: string, prompt: string): void => {
  const text = prompt.trim();
  if (text) pendingPrompts.set(projectId, text);
};

/** Returns and forgets the project's waiting prompt, or `null`. */
export const takeInitialAgentPrompt = (projectId: string): string | null => {
  const prompt = pendingPrompts.get(projectId) ?? null;
  pendingPrompts.delete(projectId);
  return prompt;
};

export const hasInitialAgentPrompt = (projectId: string): boolean => pendingPrompts.has(projectId);

/** Nothing but pinned documents (the `Integrations` document) — no trigger, function or type yet. */
export const isEmptyWorkflowProject = (documents: readonly { pinned?: boolean }[]): boolean =>
  documents.every((doc) => doc.pinned === true);

export interface IAgentAutoStartInput {
  readonly readOnly: boolean;
  readonly connectionError: string | null;
  readonly agentConfigured: boolean;
  readonly documents: readonly { pinned?: boolean }[];
  readonly rightPanel: 'agent' | 'history' | null;
  readonly hasInitialPrompt: boolean;
}

export type TAgentAutoStart = 'none' | 'open' | 'run-initial-prompt';

/**
 * What a freshly loaded workspace does with the agent panel: run the prompt handed over from the project list, or
 * just open the panel when the project is still empty (and the user hasn't picked a panel already). Never for a
 * read-only view, a failed load, or a deployment without a configured agent (the panel would only say so).
 */
export const decideAgentAutoStart = (input: IAgentAutoStartInput): TAgentAutoStart => {
  if (input.readOnly || input.connectionError || !input.agentConfigured) return 'none';
  if (input.hasInitialPrompt) return 'run-initial-prompt';
  if (input.rightPanel === null && isEmptyWorkflowProject(input.documents)) return 'open';
  return 'none';
};
