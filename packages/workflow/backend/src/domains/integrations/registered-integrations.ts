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
 * Every *statically* registered vendor integration this backend knows about — consumed by
 * `BuildService` (compilation), `DocumentsService` (encrypting/masking the `integrations`
 * document's credential fields), the internal credential resolver
 * (`internal-credentials.controller.ts`), and `GatewayModule`'s discovery port (inbound ingress for
 * whichever of these declare a `registerBackend`). Telegram and OpenAI-compatible are
 * vendor-specific; HTTP Request/Webhook are generic (credential-free) — see ADR 0006.
 *
 * ActivePieces pieces are deliberately **not** listed here — they're fetched dynamically from the
 * standalone `falang-workflow-activepieces` service via `ActivepiecesCatalogService`, so adding a
 * piece needs no code change in this repo. Call sites that need to see ActivePieces vendors too
 * (credential encode/mask/resolve — see ADR 0010) combine this array with
 * `ActivepiecesCatalogService.getDynamicIntegrations()` themselves, rather than this constant
 * growing an async dependency.
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
