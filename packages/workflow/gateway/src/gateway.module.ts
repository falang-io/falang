import { type DynamicModule, type FactoryProvider, Module, type ModuleMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Connection } from '@temporalio/client';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import type { IIntegrationsDiscoveryPort } from './discovery-port.js';
import type { IFileUploadPort } from './file-upload-port.js';
import { IntegrationWebhookController } from './integration-webhook.controller.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';
import {
  createTemporalScheduleClient,
  SCHEDULE_CLIENT_PORT,
  type IScheduleClientPort,
  type IScheduleTemporalClientHandle,
  type TGetScheduleTemporalClient,
} from './schedule-client.js';
import type { ISignalWorkflowWithStartParams, TSignalWorkflowWithStart } from './signal-workflow.js';

// Connects fresh per inbound webhook rather than holding a long-lived `Client` — mirrors
// `@falang/workflow-backend`'s `startAndAwaitWorkflow` (`build.module.ts`); webhook volume is low
// enough for now that per-request connection setup isn't a concern, and it avoids module-lifecycle
// teardown for this pass.
const signalWorkflowWithStart: TSignalWorkflowWithStart = async (params: ISignalWorkflowWithStartParams) => {
  const { namespace, signalArgs, signalName, taskQueue, temporalAddress, workflowId, workflowType } = params;
  const connection = temporalAddress
    ? await Connection.connect({ address: temporalAddress })
    : await Connection.connect();
  try {
    const client = new Client({ connection, namespace });
    await client.workflow.signalWithStart(workflowType, {
      workflowId,
      taskQueue,
      signal: signalName,
      signalArgs: [...signalArgs],
      args: [],
    });
  } finally {
    await connection.close();
  }
};

// Same connect-per-call posture as `signalWorkflowWithStart` above — a fresh `Connection`/`Client` per
// schedule call, closed right after, rather than one held for the process lifetime. See
// `createTemporalScheduleClient`'s own doc comment (`schedule-client.ts`) and
// ADR 0037 (private) §4.
const getScheduleTemporalClient =
  (config: ConfigService): TGetScheduleTemporalClient =>
  async (): Promise<IScheduleTemporalClientHandle> => {
    const temporalAddress = config.get<string>('TEMPORAL_ADDRESS');
    const namespace = config.get<string>('TEMPORAL_NAMESPACE');
    const connection = temporalAddress
      ? await Connection.connect({ address: temporalAddress })
      : await Connection.connect();
    const client = new Client({ connection, namespace });
    return { client, close: () => connection.close() };
  };

// Registered once, real and identical for every host (unlike `resolveDiscoveryPort`/
// `resolveInternalProjectToken`, which vary per host) — exported so a host module can also `@Inject`
// it directly (e.g. a future `ScheduleWakeService`'s `listAll()` sweep), not just have it flow into
// `IntegrationsRuntimeService`. See `schedule-client.ts`'s `SCHEDULE_CLIENT_PORT` doc comment.
const scheduleClientPortProvider: FactoryProvider<IScheduleClientPort> = {
  provide: SCHEDULE_CLIENT_PORT,
  useFactory: (config: ConfigService) => createTemporalScheduleClient(getScheduleTemporalClient(config)),
  inject: [ConfigService],
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
): FactoryProvider<IntegrationsRuntimeService> => ({
  provide: IntegrationsRuntimeService,
  useFactory: async (config: ConfigService, ...allArgs: readonly unknown[]) => {
    const discoveryLength = inject?.length ?? 0;
    const dynamicLength = dynamicInject?.length ?? 0;
    const tokenLength = internalProjectTokenInject?.length ?? 0;
    const fileUploadLength = fileUploadInject?.length ?? 0;
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
    // `SCHEDULE_CLIENT_PORT` is always the last injected dependency, fixed regardless of host (unlike
    // the categories above, which vary per host) — see `scheduleClientPortProvider`.
    const [scheduleClient] = allArgs.slice(discoveryLength + dynamicLength + tokenLength + fileUploadLength) as [
      IScheduleClientPort,
    ];
    const [discovery, dynamicIntegrations, getInternalProjectToken, fileUpload] = await Promise.all([
      resolveDiscoveryPort(...discoveryArgs),
      resolveDynamicIntegrations(...dynamicArgs),
      // oxlint-disable-next-line no-undefined -- a real "no token source configured" value, not a mistaken omission.
      resolveInternalProjectToken ? resolveInternalProjectToken(...tokenArgs) : undefined,
      // oxlint-disable-next-line no-undefined -- a real "no file-upload port configured" value, not a mistaken omission.
      resolveFileUploadPort ? resolveFileUploadPort(...fileUploadArgs) : undefined,
    ]);
    return new IntegrationsRuntimeService({
      integrations: [...integrations, ...dynamicIntegrations],
      discovery,
      signalWorkflowWithStart,
      publicHost: config.get<string>('GATEWAY_PUBLIC_HOST'),
      temporalAddress: config.get<string>('TEMPORAL_ADDRESS'),
      namespace: config.get<string>('TEMPORAL_NAMESPACE'),
      getInternalProjectToken,
      scheduleClient,
      fileUpload,
    });
  },
  inject: [
    ConfigService,
    ...(inject ?? []),
    ...(dynamicInject ?? []),
    ...(internalProjectTokenInject ?? []),
    ...(fileUploadInject ?? []),
    SCHEDULE_CLIENT_PORT,
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
}

@Module({})
export class GatewayModule {
  /** Reads `TEMPORAL_ADDRESS`/`TEMPORAL_NAMESPACE`/`GATEWAY_PUBLIC_HOST` the same way `@falang/workflow-backend`'s `BuildModule` reads its own config. */
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
        ),
      ],
      exports: [IntegrationsRuntimeService, SCHEDULE_CLIENT_PORT],
    };
  }
}
