import { type DynamicModule, type FactoryProvider, Module, type ModuleMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import type { IIntegrationsDiscoveryPort } from './discovery-port.js';
import type { IFileUploadPort } from './file-upload-port.js';
import type { IOAuth2AccessTokenPort } from './oauth2-access-token-port.js';
import { IntegrationWebhookController } from './integration-webhook.controller.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';
import { createTemporalScheduleClient, SCHEDULE_CLIENT_PORT, type IScheduleClientPort } from './schedule-client.js';
import { parseScheduleCatchupWindow } from './schedule-guard.js';
import { parseWorkflowExecutionTimeout } from './workflow-execution-timeout.js';
import { createSignalWorkflowWithStart } from './signal-workflow.js';
import { TEMPORAL_TENANCY, type ITemporalTenancy } from './temporal-tenancy.js';

// Registered once, real and identical for every host (unlike `resolveDiscoveryPort`/
// `resolveInternalProjectToken`, which vary per host) — exported so a host module can also `@Inject`
// it directly (e.g. a future `ScheduleWakeService`'s `listAll()` sweep), not just have it flow into
// `IntegrationsRuntimeService`. See `schedule-client.ts`'s `SCHEDULE_CLIENT_PORT` doc comment.
const scheduleClientPortProvider: FactoryProvider<IScheduleClientPort> = {
  provide: SCHEDULE_CLIENT_PORT,
  useFactory: (tenancy: ITemporalTenancy, config: ConfigService) =>
    createTemporalScheduleClient(tenancy, {
      catchupWindow: parseScheduleCatchupWindow(config.get<string>('SCHEDULE_CATCHUP_WINDOW_SECONDS')),
      workflowExecutionTimeout: parseWorkflowExecutionTimeout(config.get<string>('WORKFLOW_EXECUTION_TIMEOUT')),
    }),
  inject: [TEMPORAL_TENANCY, ConfigService],
};

type TResolveDiscoveryPort = FactoryProvider<IIntegrationsDiscoveryPort>['useFactory'];
// Borrows `FactoryProvider['useFactory']`'s own `(...args: any[])` param shape (rather than writing
// `any[]` here directly, which oxlint's `no-explicit-any` flags) — so a concretely-typed factory
// (e.g. `(catalog: ActivepiecesCatalogService) => ...`) can be passed here directly, the same way
// Nest's own `useFactory` accepts one.
type TResolveDynamicIntegrations = FactoryProvider<readonly IWorkflowIntegration[]>['useFactory'];
// Same borrowing trick as `TResolveDynamicIntegrations` above — a concretely-typed factory (e.g.
// `(tokens: ProjectTokenService) => (projectId: string) => tokens.getOrCreateToken(projectId)`) can
// be passed here directly.
type TResolveInternalProjectToken = FactoryProvider<(projectId: string) => string>['useFactory'];
// Same borrowing trick as the two aliases above — a concretely-typed factory (e.g.
// `(port: IFileUploadPort) => port`, injecting a host's own `FILE_UPLOAD_PORT`-provided instance) can
// be passed here directly.
type TResolveFileUploadPort = FactoryProvider<IFileUploadPort>['useFactory'];
// Same borrowing trick — e.g. `(port: IOAuth2AccessTokenPort) => port`.
type TResolveOAuth2AccessTokenPort = FactoryProvider<IOAuth2AccessTokenPort>['useFactory'];

/** Same value `@falang/workflow-backend`'s `DEV_PROJECT_TOKEN_SECRET` falls back to outside production. */
const DEV_WEBHOOK_SECRET_KEY = 'dev-project-token-secret-change-me';

/**
 * Key behind `ctx.deriveSecret()`: `WEBHOOK_SECRET_KEY` if set, else `PROJECT_TOKEN_SECRET` (already mandatory in production,
 * stable across restarts and shared by every replica — exactly what a derived-not-stored secret needs). Outside production a
 * missing key falls back to the dev constant, mirroring the backend's own dev default; in production none means `undefined`
 * and `deriveSecret` throws (the backend refuses to boot without `PROJECT_TOKEN_SECRET` anyway).
 */
export const resolveWebhookSecretKey = (config: ConfigService): string | undefined => {
  const configured = config.get<string>('WEBHOOK_SECRET_KEY') || config.get<string>('PROJECT_TOKEN_SECRET');
  if (configured) return configured;
  if (config.get<string>('NODE_ENV') !== 'production') return DEV_WEBHOOK_SECRET_KEY;
};

const buildIntegrationsRuntimeServiceProvider = (
  integrations: readonly IWorkflowIntegration[],
  resolveDiscoveryPort: TResolveDiscoveryPort,
  inject: FactoryProvider['inject'],
  resolveDynamicIntegrations: TResolveDynamicIntegrations,
  dynamicInject: FactoryProvider['inject'],
  resolveInternalProjectToken: TResolveInternalProjectToken | undefined,
  internalProjectTokenInject: FactoryProvider['inject'],
  resolveFileUploadPort: TResolveFileUploadPort | undefined,
  fileUploadInject: FactoryProvider['inject'],
  resolveOAuth2AccessTokenPort: TResolveOAuth2AccessTokenPort | undefined,
  oauth2AccessTokenInject: FactoryProvider['inject'],
): FactoryProvider<IntegrationsRuntimeService> => ({
  provide: IntegrationsRuntimeService,
  useFactory: async (config: ConfigService, ...allArgs: readonly unknown[]) => {
    const discoveryLength = inject?.length ?? 0;
    const dynamicLength = dynamicInject?.length ?? 0;
    const tokenLength = internalProjectTokenInject?.length ?? 0;
    const fileUploadLength = fileUploadInject?.length ?? 0;
    const oauth2Length = oauth2AccessTokenInject?.length ?? 0;
    const discoveryArgs = allArgs.slice(0, discoveryLength) as Parameters<TResolveDiscoveryPort>;
    const dynamicArgs = allArgs.slice(discoveryLength, discoveryLength + dynamicLength);
    const tokenArgs = allArgs.slice(
      discoveryLength + dynamicLength,
      discoveryLength + dynamicLength + tokenLength,
    ) as Parameters<TResolveInternalProjectToken>;
    const fileUploadArgs = allArgs.slice(
      discoveryLength + dynamicLength + tokenLength,
      discoveryLength + dynamicLength + tokenLength + fileUploadLength,
    ) as Parameters<TResolveFileUploadPort>;
    const oauth2Start = discoveryLength + dynamicLength + tokenLength + fileUploadLength;
    const oauth2Args = allArgs.slice(
      oauth2Start,
      oauth2Start + oauth2Length,
    ) as Parameters<TResolveOAuth2AccessTokenPort>;
    // `SCHEDULE_CLIENT_PORT` then `TEMPORAL_TENANCY` are always the last injected dependencies, fixed regardless of host (unlike
    // the categories above, which vary per host) — see `scheduleClientPortProvider`.
    const [scheduleClient, tenancy] = allArgs.slice(oauth2Start + oauth2Length) as [
      IScheduleClientPort,
      ITemporalTenancy,
    ];
    const [discovery, dynamicIntegrations, getInternalProjectToken, fileUpload, oauth2AccessToken] = await Promise.all([
      resolveDiscoveryPort(...discoveryArgs),
      resolveDynamicIntegrations(...dynamicArgs),
      // oxlint-disable-next-line no-undefined -- a real "no token source configured" value, not a mistaken omission.
      resolveInternalProjectToken ? resolveInternalProjectToken(...tokenArgs) : undefined,
      // oxlint-disable-next-line no-undefined -- a real "no file-upload port configured" value, not a mistaken omission.
      resolveFileUploadPort ? resolveFileUploadPort(...fileUploadArgs) : undefined,
      // oxlint-disable-next-line no-undefined -- a real "no OAuth2 access-token port configured" value, not a mistaken omission.
      resolveOAuth2AccessTokenPort ? resolveOAuth2AccessTokenPort(...oauth2Args) : undefined,
    ]);
    return new IntegrationsRuntimeService({
      integrations: [...integrations, ...dynamicIntegrations],
      discovery,
      signalWorkflowWithStart: createSignalWorkflowWithStart(
        tenancy,
        parseWorkflowExecutionTimeout(config.get<string>('WORKFLOW_EXECUTION_TIMEOUT')),
      ),
      publicHost: config.get<string>('GATEWAY_PUBLIC_HOST'),
      getInternalProjectToken,
      scheduleClient,
      fileUpload,
      oauth2AccessToken,
      webhookSecretKey: resolveWebhookSecretKey(config),
    });
  },
  inject: [
    ConfigService,
    ...(inject ?? []),
    ...(dynamicInject ?? []),
    ...(internalProjectTokenInject ?? []),
    ...(fileUploadInject ?? []),
    ...(oauth2AccessTokenInject ?? []),
    SCHEDULE_CLIENT_PORT,
    TEMPORAL_TENANCY,
  ],
});

export interface IGatewayModuleAsyncOptions {
  /** Every registered vendor integration (see `@falang/workflow-backend`'s `REGISTERED_INTEGRATIONS`) — only those with a `registerBackend` actually get driven. */
  integrations: readonly IWorkflowIntegration[];
  /** Modules exporting whatever `useFactory`'s (or `resolveDynamicIntegrations`'s) tokens need (e.g. a `TypeOrmModule.forFeature([...])`, or the module providing `resolveDynamicIntegrations`'s injected service). */
  imports?: ModuleMetadata['imports'];
  useFactory: TResolveDiscoveryPort;
  inject?: FactoryProvider['inject'];
  /**
   * Resolves additional integrations known only at Nest bootstrap time (e.g. ActivePieces vendors,
   * fetched from a catalog service — see ADR 0011 (private)) — merged with
   * `integrations` before `IntegrationsRuntimeService` is constructed. `integrations` itself has to
   * stay a plain synchronous array (it's evaluated inside `app.module.ts`'s `@Module({ imports })`
   * array, before Nest's DI phase even starts), so an async source can't just be awaited into it
   * directly; this factory runs later, at the same DI-resolution time `useFactory` already does.
   * Defaults to `() => []` when omitted.
   */
  resolveDynamicIntegrations?: TResolveDynamicIntegrations;
  dynamicInject?: FactoryProvider['inject'];
  /**
   * Resolves `IIntegrationsRuntimeParams.getInternalProjectToken` — see that field's doc comment and
   * `@falang/workflow-integrations-common`'s `IIntegrationBackendContext.getInternalProjectToken`.
   * Omit only if nothing driven by this `GatewayModule` calls back into `backend`'s own internal
   * endpoints (every real host wires this up; a bare test double may not need to).
   */
  resolveInternalProjectToken?: TResolveInternalProjectToken;
  internalProjectTokenInject?: FactoryProvider['inject'];
  /**
   * Resolves `IIntegrationsRuntimeParams.fileUpload` — see that field's doc comment and
   * `file-upload-port.ts`'s `IFileUploadPort`/`FILE_UPLOAD_PORT` doc comments. Omit only if nothing
   * driven by this `GatewayModule` calls `ctx.uploadFile()` (e.g. a host with no vendor whose ingress
   * needs it, or a bare test double) — `ctx.uploadFile()` throws if actually called without it.
   */
  resolveFileUploadPort?: TResolveFileUploadPort;
  fileUploadInject?: FactoryProvider['inject'];
  /**
   * Resolves `IIntegrationsRuntimeParams.oauth2AccessToken` — backs `ctx.getOAuth2AccessToken()`, see
   * `oauth2-access-token-port.ts`. Omit when no vendor's ingress calls its own OAuth2 API.
   */
  resolveOAuth2AccessTokenPort?: TResolveOAuth2AccessTokenPort;
  oauth2AccessTokenInject?: FactoryProvider['inject'];
}

@Module({})
export class GatewayModule {
  /** Reads `GATEWAY_PUBLIC_HOST` from config; Temporal access comes from the globally-provided `TEMPORAL_TENANCY` (`@falang/workflow-backend`'s `TemporalModule`). */
  static forRoot(integrations: readonly IWorkflowIntegration[], discovery: IIntegrationsDiscoveryPort): DynamicModule {
    return {
      module: GatewayModule,
      global: true,
      controllers: [IntegrationWebhookController],
      providers: [
        scheduleClientPortProvider,
        buildIntegrationsRuntimeServiceProvider(
          integrations,
          () => discovery,
          [],
          () => [],
          [],
          // oxlint-disable-next-line no-undefined -- no token source for this bare-`forRoot` wiring; a real value, not an omission.
          undefined,
          [],
          // oxlint-disable-next-line no-undefined -- no file-upload port for this bare-`forRoot` wiring; a real value, not an omission.
          undefined,
          [],
          // oxlint-disable-next-line no-undefined -- no OAuth2 access-token port for this bare-`forRoot` wiring.
          undefined,
          [],
        ),
      ],
      exports: [IntegrationsRuntimeService, SCHEDULE_CLIENT_PORT],
    };
  }

  /**
   * For a discovery port that itself needs DI (e.g. a repository to resolve credentials/documents) —
   * a bare object built via `forRoot`'s argument can't depend on anything Nest-managed, since it's
   * constructed before this module's own providers exist. Mirrors this app's own
   * `TypeOrmModule.forRootAsync` usage in `app.module.ts`.
   */
  static forRootAsync(options: IGatewayModuleAsyncOptions): DynamicModule {
    return {
      module: GatewayModule,
      global: true,
      imports: options.imports ?? [],
      controllers: [IntegrationWebhookController],
      providers: [
        scheduleClientPortProvider,
        buildIntegrationsRuntimeServiceProvider(
          options.integrations,
          options.useFactory,
          options.inject,
          options.resolveDynamicIntegrations ?? (() => []),
          options.dynamicInject,
          options.resolveInternalProjectToken,
          options.internalProjectTokenInject,
          options.resolveFileUploadPort,
          options.fileUploadInject,
          options.resolveOAuth2AccessTokenPort,
          options.oauth2AccessTokenInject,
        ),
      ],
      exports: [IntegrationsRuntimeService, SCHEDULE_CLIENT_PORT],
    };
  }
}
