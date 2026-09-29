import type { IBlockView, TFunction } from '@falang/scheme';
import { TOKEN_I18N, TOKEN_SCHEME, useService } from '@falang/scheme';
import { variableInfoToTsType } from '@falang/typescript-dto';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE, type TypesRegistryStore } from '@falang/typescript-scheme';
import type { TTriggerFunctionBodyData } from '@falang/workflow-dto';
import { observer } from 'mobx-react-lite';
import {
  TOKEN_INTEGRATIONS_REGISTRY,
  TOKEN_SCHEDULE_STATUS,
  type IScheduleStatusEntry,
} from '../registry/di-tokens.js';

/** `"12:30"`-shaped, no seconds — matches ADR 0037 (private) §7's own example format. */
const formatFireTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * One line per env — `"dev: active, next 12:30 · last 12:00 · skipped 0"` / `"dev: paused"` — see
 * ADR 0037 (private) §7 ("shows schedule state ... read-only").
 */
const formatScheduleStatusLine = (entry: IScheduleStatusEntry, t: TFunction): string => {
  if (entry.paused) return `${entry.env}: ${t('trigger-function:schedule-status.paused')}`;
  const parts: string[] = [t('trigger-function:schedule-status.active')];
  const nextFireTime = entry.nextFireTimes[0];
  if (nextFireTime) parts.push(t('trigger-function:schedule-status.next', { time: formatFireTime(nextFireTime) }));
  if (entry.lastFireTime)
    parts.push(t('trigger-function:schedule-status.last', { time: formatFireTime(entry.lastFireTime) }));
  parts.push(t('trigger-function:schedule-status.skipped', { count: entry.skippedOverlapCount }));
  return `${entry.env}: ${parts[0]}, ${parts.slice(1).join(' · ')}`;
};

/**
 * Read-only, mirrors a plain function-body block's name display but shows the bound trigger instead
 * of an editable parameter list — `vendor`/`triggerName`/`credentialId` are picked once in the "New
 * trigger" creation form and fixed thereafter (see ADR 0006's "trigger-function" section).
 */
export const TriggerFunctionBodyBlockComponent: IBlockView<TTriggerFunctionBodyData> = observer(({ data }) => {
  const scheme = useService(TOKEN_SCHEME);
  const registry = useService(TOKEN_INTEGRATIONS_REGISTRY);
  const t = useService(TOKEN_I18N).t;
  let typesRegistry: TypesRegistryStore | null = null;
  try {
    typesRegistry = useService(TOKEN_TYPESCRIPT_PROJECT_SERVICE).typesRegistry;
  } catch {
    // service not registered
  }
  // Optional, same graceful-degradation posture as `TOKEN_TYPESCRIPT_PROJECT_SERVICE` above — only
  // `@falang/workflow-client-common`'s `WorkflowStore` registers this (see `TOKEN_SCHEDULE_STATUS`'s
  // own doc comment); a bare test harness/other host just shows no schedule status line.
  let scheduleStatus: readonly IScheduleStatusEntry[] = [];
  try {
    scheduleStatus = useService(TOKEN_SCHEDULE_STATUS).getStatus(scheme.id);
  } catch {
    // service not registered
  }
  if (!data) return <div>&nbsp;</div>;
  const descriptor = registry.findTrigger(data.triggerName);
  const structNames = new Map(typesRegistry ? [...typesRegistry.types].map(([id, item]) => [id, item.name]) : []);
  const configSummary = descriptor?.contextFields
    ?.map((field) => data.triggerConfig?.[field.name])
    .filter(Boolean)
    .join(', ');
  return (
    <div className="workflow-integration-block workflow-integration-block--trigger-function">
      <div className="workflow-integration-block__title">
        {scheme.name || <>&nbsp;</>}
        {configSummary ? ` (${configSummary})` : ''}
      </div>
      <div className="workflow-integration-block__scope">
        {descriptor
          ? `${data.scopeVariableName}: ${variableInfoToTsType(descriptor.scopeType, structNames)}`
          : data.triggerName}
      </div>
      {scheduleStatus.length > 0 && (
        <div className="workflow-integration-block__schedule-status">
          {scheduleStatus.map((entry) => (
            <div key={entry.env}>{formatScheduleStatusLine(entry, t)}</div>
          ))}
        </div>
      )}
    </div>
  );
});
