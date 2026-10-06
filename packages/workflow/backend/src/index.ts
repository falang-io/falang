export * from './app.module.js';
export { createApp, startApp, type ICreateAppOptions } from './create-app.js';

// Extension API: what a module passed via `createApp({ extraModules })` (e.g. the hosted edition's metering)
// builds on. Import these from the package root, never by deep `src/…` paths, so an overlay only depends on
// what is meant to stay stable.
// `AdminGuard` needs `UsersService`: a module using it imports `UsersModule`.
export { AdminGuard } from './domains/auth/auth/admin.guard.js';
export { UsersModule } from './domains/users/users/users.module.js';
export { CurrentUser } from './domains/auth/auth/current-user.decorator.js';
export { JwtAuthGuard } from './domains/auth/auth/jwt-auth.guard.js';
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
