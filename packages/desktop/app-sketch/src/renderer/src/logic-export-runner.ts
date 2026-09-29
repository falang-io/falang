import { createElement } from 'react';
import { message, notification } from 'antd';
import type { ILogicExportItemResult, ILogicExportResult } from '@falang/logic-export';
import type { DesktopProjectStore } from './desktop-project-store.js';
import { reportError } from '../../shared/report-error.js';

export interface IRunLogicExportOptions {
  /** Called instead of exporting when the project has no export items configured yet — the caller typically opens the configuration modal. */
  readonly onNotConfigured: () => void;
}

const describeError = (error: ILogicExportItemResult['errors'][number]): string =>
  error.documentName ? `${error.documentName}: ${error.message}` : error.message;

const renderFailedItems = (failed: readonly ILogicExportItemResult[]) =>
  createElement(
    'div',
    null,
    failed.map((item) =>
      createElement(
        'div',
        { key: `${item.language}:${item.path}`, style: { marginBottom: 8 } },
        createElement('div', { style: { fontWeight: 600 } }, `${item.language} → ${item.path}`),
        createElement(
          'ul',
          { style: { margin: '4px 0 0', paddingLeft: 18 } },
          item.errors.map((error, index) =>
            createElement('li', { key: index, style: { whiteSpace: 'pre-wrap' } }, describeError(error)),
          ),
        ),
      ),
    ),
  );

const reportResult = (result: ILogicExportResult): void => {
  const succeeded = result.items.filter((item) => item.ok);
  const failed = result.items.filter((item) => !item.ok);
  if (succeeded.length > 0) {
    const files = succeeded.flatMap((item) => item.files);
    message.success(`Exported ${files.length} file${files.length === 1 ? '' : 's'}: ${files.join(', ')}`, 6);
  }
  if (failed.length > 0) {
    notification.error({
      title: `Export failed for ${failed.length} of ${result.items.length} target${result.items.length === 1 ? '' : 's'}`,
      description: renderFailedItems(failed),
      duration: 0,
    });
  }
};

/**
 * The one entry point for "actually generate code": used by both the native `Project > Export
 * Code` menu item and the configuration modal's own Export button. Mirrors the old app's
 * `LogicProjectStore.buildCode` (toast on start, success/error toast at the end) on AntD.
 */
export const runLogicExport = async (store: DesktopProjectStore, options: IRunLogicExportOptions): Promise<void> => {
  if (store.logicExportConfiguration.items.length === 0) {
    message.warning('No export targets configured yet — add one in Project › Export Configuration…');
    options.onNotConfigured();
    return;
  }
  // No `message.loading` spinner any more — `ExportProgressModal` (driven by `store.exportProgress`)
  // shows real progress and a Cancel button while the worker process runs, see
  // ADR 0019 (private)'s "Implementation notes (export worker …)".
  try {
    const result = await store.exportLogicCode();
    reportResult(result);
  } catch (error) {
    // `error.message` is `'Cancelled'` when the user hit the progress modal's own Cancel button
    // (`WorkerCancelledError`, see `@falang/desktop-worker-process`) — worth a neutral notice, not an
    // error toast.
    if (error instanceof Error && error.message === 'Cancelled') {
      message.info('Export cancelled');
      return;
    }
    reportError('Logic export failed', error);
    message.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
