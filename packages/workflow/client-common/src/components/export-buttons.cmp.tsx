import { useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { workflowApi } from '../api-client.js';
import { navigationStore } from '../navigation-store.js';
import { useWorkflowStore } from '../workflow-store-context.js';

export interface IProjectExport {
  readonly isExporting: boolean;
  readonly exportError: string | null;
  /** "Save as JSON": downloads the project export payload. */
  readonly exportJson: () => Promise<void>;
  /** "Download PDF" (ADR 0048 (private) print export): opens the print-export dialog. */
  readonly openPdf: () => void;
}

/** Project JSON download and PDF print export actions, used by the toolbar's "Project" menu. */
export const useProjectExport = (): IProjectExport => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportJson = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const payload = await workflowApi.exportProject(store.projectId);
      const fileName = `${(navigationStore.selectedProjectName ?? 'project').replaceAll(/[^a-z0-9-_]+/gi, '-')}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t('client:toolbar.export-failed'));
    } finally {
      setIsExporting(false);
    }
  };

  return { isExporting, exportError, exportJson, openPdf: () => store.openPrintExport() };
};
