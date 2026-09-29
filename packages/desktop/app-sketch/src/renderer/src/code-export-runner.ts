import { createElement } from 'react';
import { message, notification } from 'antd';
import type { ICodeExportFileResult, ICodeExportResult } from '@falang/simple-code-export';
import type { DesktopProjectStore } from './desktop-project-store.js';
import { reportError } from '../../shared/report-error.js';

const renderFailedItems = (failed: readonly ICodeExportFileResult[]) =>
  createElement(
    'ul',
    { style: { margin: 0, paddingLeft: 18 } },
    failed.map((item) =>
      createElement(
        'li',
        { key: item.documentId, style: { whiteSpace: 'pre-wrap' } },
        `${item.documentName}: ${item.error ?? 'unknown error'}`,
      ),
    ),
  );

const reportResult = (result: ICodeExportResult): void => {
  const succeeded = result.items.filter((item) => item.ok);
  const failed = result.items.filter((item) => !item.ok);
  if (succeeded.length > 0) {
    const files = succeeded.map((item) => item.path).filter(Boolean);
    message.success(`Exported ${files.length} file${files.length === 1 ? '' : 's'}: ${files.join(', ')}`, 6);
  }
  if (failed.length > 0) {
    notification.error({
      title: `Export failed for ${failed.length} of ${result.items.length} document${result.items.length === 1 ? '' : 's'}`,
      description: renderFailedItems(failed),
      duration: 0,
    });
  }
};

/**
 * The one entry point for "generate source files from `code` documents" — used by the native
 * `Project > Export Code Documents` menu item. Unlike `runLogicExport`, there's no configuration to
 * check first: a `code` document's language is fixed by its own `DocumentType`, so a project with no
 * `code` documents at all just reports zero files rather than needing a "not configured" prompt.
 */
export const runCodeExport = async (store: DesktopProjectStore): Promise<void> => {
  // No `message.loading` spinner any more — `ExportProgressModal` (driven by `store.exportProgress`)
  // shows real progress and a Cancel button while the worker process runs, see
  // ADR 0019 (private)'s "Implementation notes (export worker …)".
  try {
    const result = await store.exportCodeDocuments();
    if (result.items.length === 0) {
      message.info('No code documents in this project');
      return;
    }
    reportResult(result);
  } catch (error) {
    // Same `WorkerCancelledError` posture as `logic-export-runner.ts`'s own catch block.
    if (error instanceof Error && error.message === 'Cancelled') {
      message.info('Export cancelled');
      return;
    }
    reportError('Code export failed', error);
    message.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
