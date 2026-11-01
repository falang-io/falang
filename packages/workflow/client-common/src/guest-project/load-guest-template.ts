import { workflowApi } from '../api-client.js';
import { generateUuid } from '../generate-uuid.js';
import { readGuestProjectDraft } from './guest-project-draft.js';
import { buildGuestProjectState, type IGuestProjectState } from './guest-project.js';

export interface IGuestTemplate {
  /** The project name — the template's. */
  readonly name: string;
  readonly state: IGuestProjectState;
}

/**
 * What the guest workspace opens for `#/templates/<key>`: the guest's own draft of this template when there is one
 * (they edited it before and came back), else the template itself from the public routes. Rejects when the template
 * is unknown or disabled.
 */
export const loadGuestTemplate = async (key: string): Promise<IGuestTemplate> => {
  const draft = readGuestProjectDraft();
  if (draft?.templateKey === key) return { name: draft.name, state: draft.state };
  const [summary, payload] = await Promise.all([
    workflowApi.getProjectTemplate(key),
    workflowApi.getProjectTemplatePayload(key),
  ]);
  return { name: summary.name, state: buildGuestProjectState(payload, generateUuid) };
};

/** The guest project's id (local only — it keys the remembered tabs, never reaches the backend). */
export const guestProjectId = (key: string): string => `guest-template:${key}`;
