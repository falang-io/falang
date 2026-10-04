import { resolveService } from '@falang/di';
import type { IModule, Scheme } from '@falang/scheme';
import { checker, TOKEN_CONTEXT_MENU, TOKEN_I18N } from '@falang/scheme';
import { registerContainerScopeContributor, registerScopeContributor } from '@falang/typescript-common';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '@falang/typescript-scheme';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  registerIntegrationScopeContributors,
  registerQuestionScopeContributors,
} from '@falang/workflow-integrations-common';
import {
  TOKEN_ACTIVEPIECES_CATALOG_PROVIDER,
  TOKEN_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER,
  TOKEN_CREDENTIALS_PROVIDER,
  TOKEN_FIELD_OPTIONS_PROVIDER,
  TOKEN_INTEGRATIONS_REGISTRY,
} from './di-tokens.js';
import type {
  IActivepiecesCatalogProvider,
  IActivepiecesFieldOptionsProvider,
  IFieldOptionsProvider,
} from './di-tokens.js';
import { IntegrationsRegistryStore } from './integrations-registry.store.js';
import { getIntegrationMenuVendors } from './integration-insert-menu.js';
import { seedIntegrationTypes } from './seed-integration-types.js';
import { registerWorkflowSchemeLocales } from '../locales/workflow-scheme-locales.js';
import { registerOptionsSyncOnMove } from '../blocks/sync-options-on-move.js';
import { registerOptionsValencePointsFilter } from '../blocks/options-valence-points-filter.js';

const NO_CREDENTIAL_INSTANCES = (): readonly IIntegrationInstance[] => [];
const NO_FIELD_OPTIONS_PROVIDER: IFieldOptionsProvider = {
  loadOptions: () => Promise.resolve([]),
};
const NO_ACTIVEPIECES_CATALOG_PROVIDER: IActivepiecesCatalogProvider = {
  getPieces: () => Promise.resolve([]),
};
const NO_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER: IActivepiecesFieldOptionsProvider = {
  loadOptions: () => Promise.resolve([]),
};

/**
 * Registers the vendor descriptor list the generic action/trigger blocks resolve via `useService`,
 * seeds every vendor's struct types (`IWorkflowIntegration.types`) into `TypesRegistryStore`, and
 * exposes the project's live credential instances (see `ICredentialsProvider`) so a
 * `credential-ref` field can render a real bot picker. Type-registry seeding is resolved optionally,
 * same graceful-degradation pattern as every other `@falang/typescript-scheme` consumer, since a
 * scheme built without `registerTypescriptProjectService` (e.g. a bare test harness) simply skips it.
 */
export class IntegrationsModule implements IModule {
  private readonly integrations: readonly IWorkflowIntegration[];
  private readonly getCredentialInstances: () => readonly IIntegrationInstance[];
  private readonly getFieldOptionsProvider: () => IFieldOptionsProvider;
  private readonly getActivepiecesCatalogProvider: () => IActivepiecesCatalogProvider;
  private readonly getActivepiecesFieldOptionsProvider: () => IActivepiecesFieldOptionsProvider;
  private disposers: (() => void)[] = [];

  constructor(
    integrations: readonly IWorkflowIntegration[],
    getCredentialInstances: () => readonly IIntegrationInstance[] = NO_CREDENTIAL_INSTANCES,
    getFieldOptionsProvider: () => IFieldOptionsProvider = () => NO_FIELD_OPTIONS_PROVIDER,
    getActivepiecesCatalogProvider: () => IActivepiecesCatalogProvider = () => NO_ACTIVEPIECES_CATALOG_PROVIDER,
    getActivepiecesFieldOptionsProvider: () => IActivepiecesFieldOptionsProvider = () =>
      NO_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER,
  ) {
    this.integrations = integrations;
    this.getCredentialInstances = getCredentialInstances;
    this.getFieldOptionsProvider = getFieldOptionsProvider;
    this.getActivepiecesCatalogProvider = getActivepiecesCatalogProvider;
    this.getActivepiecesFieldOptionsProvider = getActivepiecesFieldOptionsProvider;
  }

  register(scheme: Scheme) {
    scheme.container.register(TOKEN_INTEGRATIONS_REGISTRY, {
      useValue: new IntegrationsRegistryStore(this.integrations),
    });
    scheme.container.register(TOKEN_CREDENTIALS_PROVIDER, {
      useValue: { getInstances: this.getCredentialInstances },
    });
    scheme.container.register(TOKEN_FIELD_OPTIONS_PROVIDER, {
      useValue: this.getFieldOptionsProvider(),
    });
    scheme.container.register(TOKEN_ACTIVEPIECES_CATALOG_PROVIDER, {
      useValue: this.getActivepiecesCatalogProvider(),
    });
    scheme.container.register(TOKEN_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER, {
      useValue: this.getActivepiecesFieldOptionsProvider(),
    });
    try {
      const { typesRegistry } = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, scheme.container);
      seedIntegrationTypes(this.integrations, typesRegistry);
    } catch {
      // TypescriptProjectService not registered in this scheme — nothing to seed.
    }

    // Generic new-variable scope contribution (ADR 0039 (private) §3): every action with a
    // `kind: 'new-variable'` field (`call-ai-text`'s `resultVariable`, and every other vendor's own
    // result-capturing field) gets one contributor, registered by the node name the action itself is
    // registered under (`action.name` — see `integration-nodes-icons-group.ts`). Shared with
    // `@falang/workflow-compiler`'s own registration (`compile-project.ts`, needed so debug
    // instrumentation sees the same contribution when compiling on the backend, which never runs
    // `IntegrationsModule`) via `@falang/workflow-integrations-common`'s
    // `registerIntegrationScopeContributors` — global and idempotent-by-name (see
    // `registerScopeContributor`), so re-running this across multiple scheme constructions just
    // re-registers the same contributors, harmlessly.
    registerIntegrationScopeContributors(this.integrations, registerScopeContributor);
    // Same rationale, for a question's `answerScope` (ADR 0040 (private) §4) — registered on the
    // option node (`<name>-option`), not the header, since the variable is only in scope inside
    // each branch.
    registerQuestionScopeContributors(this.integrations, registerContainerScopeContributor);

    registerWorkflowSchemeLocales(scheme);
    const i18n = resolveService(TOKEN_I18N, scheme.container);
    for (const integration of this.integrations) {
      if (!integration.locales) continue;
      i18n.register(`integration:${integration.vendor}`, integration.locales);
    }
  }

  initialize(scheme: Scheme) {
    // Dragging a question/choice option keeps the header's `options` list in the new order; their branch
    // valence points only show while icons are moved (options are added in the header block).
    const registry = resolveService(TOKEN_INTEGRATIONS_REGISTRY, scheme.container);
    this.disposers.push(
      registerOptionsSyncOnMove(scheme, registry),
      registerOptionsValencePointsFilter(scheme, registry),
    );

    // "Integrations" → vendor → actions/questions/choices, only for vendors that have an instance in the
    // project's `Integrations` document (or need no credentials at all). Re-evaluated every time the
    // menu opens, so adding/removing an instance shows up immediately.
    // No context menu in this scheme (bare test harness / read-only print): nothing to extend.
    const contextMenuService = this.tryResolveContextMenu(scheme);
    if (!contextMenuService) return;
    contextMenuService.registerBuilderForValencePoint(({ builder, vp, parent }) => {
      if (!checker.isWithSkewer(parent)) return;
      const t = resolveService(TOKEN_I18N, scheme.container).t;
      for (const entry of getIntegrationMenuVendors(this.integrations, this.getCredentialInstances())) {
        builder.addForIcons({
          group: '',
          groupPath: [t('menu:group-integrations'), entry.label],
          index: vp.index,
          parentId: vp.parentId,
          items: [...entry.nodeNames],
        });
      }
    });
  }

  dispose() {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }

  private tryResolveContextMenu(scheme: Scheme) {
    try {
      return resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    } catch {
      return null;
    }
  }
}
