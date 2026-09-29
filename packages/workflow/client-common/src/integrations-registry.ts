import { getGlobalI18n } from '@falang/scheme';
import { amocrmIntegration } from '@falang/workflow-integrations-amocrm';
import { bitrix24Integration } from '@falang/workflow-integrations-bitrix24';
import { diadocIntegration } from '@falang/workflow-integrations-diadoc';
import { filesIntegration } from '@falang/workflow-integrations-files';
import { gigachatIntegration } from '@falang/workflow-integrations-gigachat';
import { httpRequestIntegration } from '@falang/workflow-integrations-http-request';
import { mediaIntegration } from '@falang/workflow-integrations-media';
import { moyskladIntegration } from '@falang/workflow-integrations-moysklad';
import { mysqlIntegration } from '@falang/workflow-integrations-mysql';
import { onecIntegration } from '@falang/workflow-integrations-onec';
import { openaiIntegration } from '@falang/workflow-integrations-openai';
import { ozonIntegration } from '@falang/workflow-integrations-ozon';
import { postgresIntegration } from '@falang/workflow-integrations-postgres';
import { scheduleIntegration } from '@falang/workflow-integrations-schedule';
import { sqliteIntegration } from '@falang/workflow-integrations-sqlite';
import { tasksIntegration } from '@falang/workflow-integrations-tasks';
import { tbankIntegration } from '@falang/workflow-integrations-tbank';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { webhookIntegration } from '@falang/workflow-integrations-webhook';
import { wildberriesIntegration } from '@falang/workflow-integrations-wildberries';
import { yandexgptIntegration } from '@falang/workflow-integrations-yandexgpt';
import { yookassaIntegration } from '@falang/workflow-integrations-yookassa';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';

/**
 * Every vendor the editor lets a user configure credentials for — mirrors
 * `@falang/workflow-backend`'s `BuildService`'s `REGISTERED_INTEGRATIONS` (see ADR 0006). Kept as its
 * own client-side list rather than fetched from the backend since it's static, compiled-in data, same
 * as the backend's copy.
 *
 * amoCRM/GigaChat were missing from this list entirely until the Bitrix24 pass (see
 * ADR 0017 (private)) added them alongside it — a real gap: both shipped MVP backend packages
 * earlier but were never wired into the editor's own vendor list, so neither was selectable in
 * `IntegrationsEditor`/"New trigger" despite `registered-integrations.ts`'s backend copy already
 * knowing about them.
 */
export const REGISTERED_INTEGRATIONS: readonly IWorkflowIntegration[] = [
  telegramIntegration,
  openaiIntegration,
  httpRequestIntegration,
  webhookIntegration,
  amocrmIntegration,
  gigachatIntegration,
  bitrix24Integration,
  onecIntegration,
  yookassaIntegration,
  diadocIntegration,
  yandexgptIntegration,
  ozonIntegration,
  wildberriesIntegration,
  moyskladIntegration,
  tbankIntegration,
  scheduleIntegration,
  filesIntegration,
  mediaIntegration,
  postgresIntegration,
  mysqlIntegration,
  sqliteIntegration,
  tasksIntegration,
];

/**
 * `IntegrationsModule.register(scheme)` normally registers each vendor's `locales` under
 * `integration:${vendor}`, but that only runs once some document's `Scheme` is built. The pinned
 * `integrations` document (`IntegrationsEditor`) never builds one — see
 * `WorkflowStore.getScheme`'s pinned-document guard — so without this, `t(integration.label)` there
 * resolves against an unregistered i18next namespace and falls back to the bare key (`"label"`), until
 * the user happens to open some other document first. Registering here too is safe: `I18NStore.register`
 * just re-sets the loader map, and `loadModuleForLanguage` skips modules it already loaded.
 */
for (const integration of REGISTERED_INTEGRATIONS) {
  if (integration.locales) {
    getGlobalI18n().register(`integration:${integration.vendor}`, integration.locales);
  }
}
