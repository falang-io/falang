import { navigationStore, type NavigationStore } from '../navigation-store.js';
import { forgetPendingTemplate } from '../pending-template.js';
import type { ProjectListStore } from '../project-list-store.js';
import { forgetGuestProjectDraft, readGuestProjectDraft, type IGuestProjectDraft } from './guest-project-draft.js';
import { guestProjectToExport } from './guest-project.js';

let claiming: Promise<boolean> | null = null;

const importDraft = async (
  store: Pick<ProjectListStore, 'createProjectFromGuestDraft'>,
  nav: Pick<NavigationStore, 'selectProject'>,
  draft: IGuestProjectDraft,
): Promise<boolean> => {
  const project = await store.createProjectFromGuestDraft(
    draft.templateKey,
    guestProjectToExport(draft.state, draft.name),
  );
  if (!project) return false;
  forgetGuestProjectDraft();
  nav.selectProject(project.id, project.name);
  return true;
};

/**
 * Right after a guest signs in (or signs up), the template they edited becomes their new project: the draft is
 * imported, forgotten, and the project opens. Returns `false` at once when there is no draft. The remembered
 * template is dropped first, so the project list doesn't also offer "create from template". A failed import keeps
 * the draft (the list shows `store.error`) for the next visit. One claim at a time — StrictMode mounts twice.
 */
export const claimGuestProjectDraft = (
  store: Pick<ProjectListStore, 'createProjectFromGuestDraft'>,
  nav: Pick<NavigationStore, 'closeTemplate' | 'selectProject'> = navigationStore,
): boolean => {
  if (claiming) return true;
  const draft = readGuestProjectDraft();
  if (!draft) return false;
  forgetPendingTemplate();
  nav.closeTemplate();
  claiming = importDraft(store, nav, draft).finally(() => {
    claiming = null;
  });
  return true;
};
