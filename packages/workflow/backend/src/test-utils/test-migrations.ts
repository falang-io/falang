/* Spike (2026-10-31): the built-in migrations as static imports — TypeORM's glob loads `.ts` files through Node's own
 * loader, which fails under vitest ("Cannot use import statement outside a module"). Generated from src/migrations. */
import { InitialSchema1789382823424 } from '../migrations/1789382823424-InitialSchema.js';
import { ProjectVersionArtifactInMemory1789468361840 } from '../migrations/1789468361840-ProjectVersionArtifactInMemory.js';
import { ProjectCommits1789550000000 } from '../migrations/1789550000000-ProjectCommits.js';
import { PersonalAccessTokens1789555000000 } from '../migrations/1789555000000-PersonalAccessTokens.js';
import { DocumentLocks1789555100000 } from '../migrations/1789555100000-DocumentLocks.js';
import { ProjectLastEditedAt1789600000000 } from '../migrations/1789600000000-ProjectLastEditedAt.js';
import { UserRole1789700000000 } from '../migrations/1789700000000-UserRole.js';
import { OAuthCredentials1789700100000 } from '../migrations/1789700100000-OAuthCredentials.js';
import { AppSettings1789800000000 } from '../migrations/1789800000000-AppSettings.js';
import { IntegrationVendorData1789920000000 } from '../migrations/1789920000000-IntegrationVendorData.js';
import { Files1789930000000 } from '../migrations/1789930000000-Files.js';
import { UserLimits1789940000000 } from '../migrations/1789940000000-UserLimits.js';
import { HumanTasks1789950000000 } from '../migrations/1789950000000-HumanTasks.js';
import { UserTermsAcceptedAt1789960000000 } from '../migrations/1789960000000-UserTermsAcceptedAt.js';
import { UserLimitsMaxProdVersions1789970000000 } from '../migrations/1789970000000-UserLimitsMaxProdVersions.js';
import { AgentUsage1789980000000 } from '../migrations/1789980000000-AgentUsage.js';
import { ProjectTemplates1789990000000 } from '../migrations/1789990000000-ProjectTemplates.js';
import { UsersEmailAndApplication1790000000000 } from '../migrations/1790000000000-UsersEmailAndApplication.js';
import { AuthTokens1790010000000 } from '../migrations/1790010000000-AuthTokens.js';
import { SupportMessages1790020000000 } from '../migrations/1790020000000-SupportMessages.js';
import { FixedFolders1790030000000 } from '../migrations/1790030000000-FixedFolders.js';
import { ProjectProdEnabled1790040000000 } from '../migrations/1790040000000-ProjectProdEnabled.js';
import { ProjectProdBuildId1790050000000 } from '../migrations/1790050000000-ProjectProdBuildId.js';
import { AgentUsageCachedPromptTokens1790060000000 } from '../migrations/1790060000000-AgentUsageCachedPromptTokens.js';
import { RunJournal1790070000000 } from '../migrations/1790070000000-RunJournal.js';
import { InstanceRuntime1790090000000 } from '../migrations/1790090000000-InstanceRuntime.js';
import { ProjectMembers1790100000000 } from '../migrations/1790100000000-ProjectMembers.js';
import { ProjectTemplateSlug1790110000000 } from '../migrations/1790110000000-ProjectTemplateSlug.js';
import { OAuth2PendingStates1790120000000 } from '../migrations/1790120000000-OAuth2PendingStates.js';
import { ResourceLimits1790130000000 } from '../migrations/1790130000000-ResourceLimits.js';
import { AuthHardening1790140000000 } from '../migrations/1790140000000-AuthHardening.js';

export const TEST_MIGRATIONS = [
  InitialSchema1789382823424,
  ProjectVersionArtifactInMemory1789468361840,
  ProjectCommits1789550000000,
  PersonalAccessTokens1789555000000,
  DocumentLocks1789555100000,
  ProjectLastEditedAt1789600000000,
  UserRole1789700000000,
  OAuthCredentials1789700100000,
  AppSettings1789800000000,
  IntegrationVendorData1789920000000,
  Files1789930000000,
  UserLimits1789940000000,
  HumanTasks1789950000000,
  UserTermsAcceptedAt1789960000000,
  UserLimitsMaxProdVersions1789970000000,
  AgentUsage1789980000000,
  ProjectTemplates1789990000000,
  UsersEmailAndApplication1790000000000,
  AuthTokens1790010000000,
  SupportMessages1790020000000,
  FixedFolders1790030000000,
  ProjectProdEnabled1790040000000,
  ProjectProdBuildId1790050000000,
  AgentUsageCachedPromptTokens1790060000000,
  RunJournal1790070000000,
  InstanceRuntime1790090000000,
  ProjectMembers1790100000000,
  ProjectTemplateSlug1790110000000,
  OAuth2PendingStates1790120000000,
  ResourceLimits1790130000000,
  AuthHardening1790140000000,
];
