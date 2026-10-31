export * from './app.module.js';
export { createApp, startApp, type ICreateAppOptions } from './create-app.js';

// Extension API: what a module passed via `createApp({ extraModules })` (e.g. the hosted edition's metering)
// builds on. Import these from the package root, never by deep `src/…` paths, so an overlay only depends on
// what is meant to stay stable.
// `AdminGuard` needs `UsersService`: a module using it imports `UsersModule`.
// `AuthService.login(user)` mints the same access token as `POST /auth/login` (local mode's auto-login uses it).
export { AuthModule } from './domains/auth/auth/auth.module.js';
export { AuthService } from './domains/auth/auth/auth.service.js';
export { UsersService } from './domains/users/users/users.service.js';
export { AdminGuard } from './domains/auth/auth/admin.guard.js';
export { UsersModule } from './domains/users/users/users.module.js';
export { CurrentUser } from './domains/auth/auth/current-user.decorator.js';
export { JwtAuthGuard } from './domains/auth/auth/jwt-auth.guard.js';
// `@Public()` exempts a route from the global `JwtAuthGuard` — a payment provider's webhook, for instance.
export { Public } from './domains/auth/auth/public.decorator.js';
export type { IJwtPayloadUser } from './domains/auth/auth/jwt.strategy.js';
export { AppSettingsModule } from './domains/admin/app-settings/app-settings.module.js';
export { AppSettingsService } from './domains/admin/app-settings/app-settings.service.js';
export {
  AGENT_USAGE_SINK,
  type IAgentUsageAfterCallContext,
  type IAgentUsageCallContext,
  type IAgentUsageSink,
} from './domains/agent-chat/agent-usage-sink.js';
export type { IAgentChatUsage } from './domains/agent-chat/agent-chat.types.js';
export { AgentUsage } from './domains/agent-chat/agent-usage.entity.js';
export { DbAgentUsageSink, type IAgentUsageTotals } from './domains/agent-chat/db-agent-usage-sink.js';
export {
  RUN_JOURNAL_STORE,
  RunJournalModule,
  prepareJournalEntries,
  type IRunJournalStore,
  type IRunJournalEntryDto,
  type IRunJournalEntryInput,
  type IRunJournalRow,
  type TJournalEnv,
  type TJournalKind,
  type TJournalLevel,
} from './domains/run-journal/index.js';

// ADR 0067 (private): the instance-uptime record, the runner start guard and project suspension — what the hosted
// edition's meter/balance watch builds on. Provide `RUNNER_SESSION_SINK` / `RUNNER_START_GUARD` from a `@Global()` module.
export {
  RUNNER_SESSION_SINK,
  RUNNER_START_GUARD,
  type IRunnerSession,
  type IRunnerSessionSink,
  type IRunnerStartContext,
  type IRunnerStartGuard,
  type TRunnerStartAction,
} from './domains/build/runner-sessions/runner-session-hooks.js';
export { RunnerSession, type TRunnerSessionEndReason } from './domains/build/runner-sessions/runner-session.entity.js';
export { RunnerSessionsModule } from './domains/build/runner-sessions/runner-sessions.module.js';
export { RunnerSessionsService } from './domains/build/runner-sessions/runner-sessions.service.js';
export { ProjectSuspendedException } from './domains/build/runner-sessions/project-suspended.exception.js';
export { ProjectSuspensionService, type TSuspendedReason } from './domains/build/build/project-suspension.service.js';
export { BuildModule } from './domains/build/build/build.module.js';
export { ProjectsModule } from './domains/projects/projects/projects.module.js';
export { ProjectsService } from './domains/projects/projects/projects.service.js';
// Mail for overlay modules (e.g. the cloud balance watch): `send` never throws, `buildClientLink` builds a client URL.
export { MailModule } from './domains/mail/mail.module.js';
export { MailService, type ISendMailInput } from './domains/mail/mail.service.js';

// ADR 0072 (private) local-mode seams: an overlay `@Global()` module may provide these tokens.
export { RUNNER_DEPLOYMENTS_CLIENT, type IK8sDeploymentsClient } from './domains/build/build/k8s-deployments-client.js';
export type { V1Deployment } from '@kubernetes/client-node';
export {
  FILE_STORAGE_OVERRIDE,
  type IFileStorage,
  type IFileStorageGetResult,
  type IFileStoragePutOptions,
  type IFileStoragePutResult,
} from './domains/files/file-storage.js';
