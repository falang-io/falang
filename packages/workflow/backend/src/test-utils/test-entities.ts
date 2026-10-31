/* Spike (2026-10-31): the harness entity list, generated from e2e-app.ts for the schema-diff probe. */
import { OAuth2PendingStateRow } from '../domains/integrations/oauth2-pending-state.entity.js';
import { AppSetting } from '../domains/admin/app-settings/app-setting.entity.js';
import { OAuthCredential } from '../domains/admin/oauth-credentials/oauth-credential.entity.js';
import { UserLimits } from '../domains/admin/user-limits/user-limits.entity.js';
import { AuthMailEvent } from '../domains/auth/mail-limits/auth-mail-event.entity.js';
import { AuthToken } from '../domains/auth/auth-tokens/auth-token.entity.js';
import { PersonalAccessToken } from '../domains/auth/personal-access-tokens/personal-access-token.entity.js';
import { File } from '../domains/files/file.entity.js';
import { IntegrationVendorData } from '../domains/integrations/vendor-data/integration-vendor-data.entity.js';
import { RunnerSession } from '../domains/build/runner-sessions/runner-session.entity.js';
import { Document } from '../domains/projects/documents/document.entity.js';
import { Folder } from '../domains/projects/folders/folder.entity.js';
import { RunJournalEntry } from '../domains/run-journal/run-journal-entry.entity.js';
import { AgentUsage } from '../domains/agent-chat/agent-usage.entity.js';
import { Project } from '../domains/projects/projects/project.entity.js';
import { ProjectMember } from '../domains/projects/members/project-member.entity.js';
import { Task } from '../domains/tasks/task.entity.js';
import { ProjectTemplate } from '../domains/projects/templates/project-template.entity.js';
import { ProjectBlob } from '../domains/projects/versioning/project-blob.entity.js';
import { ProjectCommit } from '../domains/projects/versioning/project-commit.entity.js';
import { SupportMessage } from '../domains/support/support-message.entity.js';
import { User } from '../domains/users/users/user.entity.js';

export const TEST_ENTITIES = [
  User,
  Project,
  Folder,
  Document,
  PersonalAccessToken,
  ProjectCommit,
  ProjectBlob,
  OAuthCredential,
  AppSetting,
  IntegrationVendorData,
  OAuth2PendingStateRow,
  UserLimits,
  File,
  AgentUsage,
  RunJournalEntry,
  ProjectTemplate,
  AuthToken,
  AuthMailEvent,
  SupportMessage,
  RunnerSession,
  ProjectMember,
  Task,
];
