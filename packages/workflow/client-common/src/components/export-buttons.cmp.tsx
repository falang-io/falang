import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from 'antd';
import { ExportOutlined, FilePdfOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { workflowApi } from '../api-client.js';
import { navigationStore } from '../navigation-store.js';
import { useWorkflowStore } from '../workflow-store-context.js';

export interface IExportButtonsProps {
  readonly buttonStyle: React.CSSProperties;
  readonly errorStyle: React.CSSProperties;
}

/** Toolbar "Export" (project JSON download) and "PDF" (ADR 0048 (private) print export) buttons. */
export const ExportButtons: React.FC<IExportButtonsProps> = observer(({ buttonStyle, errorStyle }) => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
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

  return (
    <>
      <Button
        icon={<ExportOutlined />}
        style={buttonStyle}
        loading={isExporting}
        onClick={() => {
          handleExport();
        }}
      >
        {isExporting ? t('client:toolbar.exporting') : t('client:toolbar.export')}
      </Button>
      <Button icon={<FilePdfOutlined />} style={buttonStyle} onClick={() => store.openPrintExport()}>
        {t('client:toolbar.export-pdf')}
      </Button>
      {exportError && <span style={errorStyle}>{exportError}</span>}
    </>
  );
});
