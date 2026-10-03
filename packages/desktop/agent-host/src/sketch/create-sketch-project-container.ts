import { container, resolveService, type DependencyContainer } from '@falang/di';
import { registerProjectDocumentsRegistry } from '@falang/text-scheme';
import {
  registerTypescriptProjectService,
  setMonacoLibVariant,
  TOKEN_TYPESCRIPT_PROJECT_SERVICE,
} from '@falang/typescript-scheme';

/**
 * `app-sketch`'s per-project DI container, exactly as `DesktopProjectStore`'s constructor builds it.
 *
 * `monaco.typescript.typescriptDefaults` is one global instance for the whole window — a 'logic'-type project's
 * `function`/`objects-structure`/etc. documents compile through `@falang/logic-constructor`, which only supports a narrow,
 * non-JS-specific expression subset (`lib-portable.ts`), so only that project type gets the portable lib variant; every
 * other type keeps the full JS/TS lib. The UI is light (unlike the workflow product), so the project service's theme is
 * switched explicitly. Needs no Monaco itself — `setMonacoLibVariant` only records the choice until an editor exists.
 */
export const createSketchProjectContainer = (projectType: string): DependencyContainer => {
  setMonacoLibVariant(projectType === 'logic' ? 'portable' : 'full');
  const child = container.createChildContainer();
  registerProjectDocumentsRegistry(child);
  registerTypescriptProjectService(child);
  resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, child).setTheme('light');
  return child;
};
