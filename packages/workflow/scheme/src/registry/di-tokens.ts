import { createSchemeToken } from '@falang/di';
import type { IActivepiecesPieceCatalogEntry } from '@falang/workflow-integrations-activepieces';
import type { IFieldSelectOption, IIntegrationInstance } from '@falang/workflow-integrations-common';
import type { ActivepiecesPickerStore } from '../blocks/activepieces-action/activepieces-picker.store.js';
import type { IntegrationsRegistryStore } from './integrations-registry.store.js';

export const TOKEN_INTEGRATIONS_REGISTRY = createSchemeToken<IntegrationsRegistryStore>('INTEGRATIONS_REGISTRY');

/** Live read access to the project's configured credential instances — see `IntegrationsModule`. */
export interface ICredentialsProvider {
  getInstances(): readonly IIntegrationInstance[];
}

export const TOKEN_CREDENTIALS_PROVIDER = createSchemeToken<ICredentialsProvider>('CREDENTIALS_PROVIDER');

/** Backs any `kind: 'select'` field with a `loadOptions` hook (e.g. `call-ai-text`'s `model`) — see `IntegrationsModule`. */
export interface IFieldOptionsProvider {
  loadOptions(
    vendor: string,
    credentialId: string,
    actionName: string,
    fieldName: string,
  ): Promise<readonly IFieldSelectOption[]>;
}

export const TOKEN_FIELD_OPTIONS_PROVIDER = createSchemeToken<IFieldOptionsProvider>('FIELD_OPTIONS_PROVIDER');

/**
 * Backs `DROPDOWN`/`MULTI_SELECT_DROPDOWN` ActivePieces props — see `ActivepiecesActionEditorStore`.
 * Distinct from `IFieldOptionsProvider`: ActivePieces' dynamic options depend on other sibling prop
 * values (`refreshers`), not just the credential, so `propsValue` is required here.
 */
export interface IActivepiecesFieldOptionsProvider {
  loadOptions(
    credentialId: string,
    pieceName: string,
    actionName: string,
    fieldName: string,
    propsValue: Readonly<Record<string, unknown>>,
  ): Promise<readonly IFieldSelectOption[]>;
}

export const TOKEN_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER = createSchemeToken<IActivepiecesFieldOptionsProvider>(
  'ACTIVEPIECES_FIELD_OPTIONS_PROVIDER',
);

/**
 * Fetches the ActivePieces piece catalog (from the standalone `falang-workflow-activepieces`
 * service, via a backend proxy) — see `ActivepiecesActionEditorStore` and
 * ADR 0010 (private). Cached client-side by the implementation, not
 * this interface's concern.
 */
export interface IActivepiecesCatalogProvider {
  getPieces(): Promise<readonly IActivepiecesPieceCatalogEntry[]>;
}

export const TOKEN_ACTIVEPIECES_CATALOG_PROVIDER = createSchemeToken<IActivepiecesCatalogProvider>(
  'ACTIVEPIECES_CATALOG_PROVIDER',
);

/** Backs the `ActivepiecesPickerLayer` modal — see `ActivepiecesPickerModule`. */
export const TOKEN_ACTIVEPIECES_PICKER = createSchemeToken<ActivepiecesPickerStore>('ACTIVEPIECES_PICKER');

/**
 * One entry of a bound `trigger-function`'s reconciled Temporal Schedule state, per env — a narrowed,
 * package-local shape (not `@falang/workflow-client-common`'s own `IApiSchedule`, which this package
 * must not depend on) that `IScheduleStatusReader.getStatus` returns just enough of for
 * `TriggerFunctionBodyBlockComponent`'s read-only status line — see
 * ADR 0037 (private) §7.
 */
export interface IScheduleStatusEntry {
  readonly env: 'dev' | 'prod';
  readonly paused: boolean;
  /** ISO-8601 timestamps, soonest first. */
  readonly nextFireTimes: readonly string[];
  /** ISO-8601, or `null` if this schedule has never fired yet. */
  readonly lastFireTime: string | null;
  readonly skippedOverlapCount: number;
}

/**
 * Live read access to the project's reconciled schedule state, keyed by the bound `trigger-function`
 * document id — backed by `@falang/workflow-client-common`'s `ScheduleStatusStore` (polls
 * `GET /projects/:id/schedules` every 30s, only while the project has at least one `schedule`-vendor
 * trigger-function), registered once on `WorkflowStore`'s own container (see `TOKEN_TYPESCRIPT_PROJECT_SERVICE`
 * for the same "registered on the store's container, visible to every child scheme container" shape).
 * Resolved optionally (try/catch) by `TriggerFunctionBodyBlockComponent`, same graceful-degradation
 * posture as every other `@falang/typescript-scheme`/`client-common`-provided service that package
 * consumes — a bare test harness with no `WorkflowStore` around it just skips the schedule status line.
 */
export interface IScheduleStatusReader {
  getStatus(documentId: string): readonly IScheduleStatusEntry[];
}

export const TOKEN_SCHEDULE_STATUS = createSchemeToken<IScheduleStatusReader>('SCHEDULE_STATUS');
