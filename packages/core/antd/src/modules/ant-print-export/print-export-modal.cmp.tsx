import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Checkbox, Modal, Space, Typography } from 'antd';
import type { PrintExportStore } from './print-export.store.js';
import { usePrintExportT } from './use-print-export-t.js';

export interface IPrintExportModalProps {
  readonly store: PrintExportStore;
  readonly open: boolean;
  /** Called on Cancel and after "Print" started the preview (the host then renders `PrintLayer`). */
  readonly onClose: () => void;
}

/** Document checklist with "All" / "Active document only" shortcuts; "Print" runs `store.startPreview()`. */
export const PrintExportModal: React.FC<IPrintExportModalProps> = observer(({ store, open, onClose }) => {
  const t = usePrintExportT();

  useEffect(() => {
    if (open) store.refresh();
  }, [open, store]);

  const print = (): void => {
    store.startPreview();
    onClose();
  };

  return (
    <Modal
      open={open}
      title={t('print-export:title')}
      okText={t('print-export:print')}
      cancelText={t('print-export:cancel')}
      okButtonProps={{ disabled: store.selectedIds.length === 0, 'data-testid': 'print-export-ok' } as never}
      onOk={print}
      onCancel={onClose}
      destroyOnHidden
      modalRender={(node) => <div data-testid="print-export-modal">{node}</div>}
    >
      <Typography.Paragraph type="secondary">{t('print-export:hint')}</Typography.Paragraph>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" onClick={() => store.selectAll()}>
          {t('print-export:all')}
        </Button>
        <Button size="small" onClick={() => store.selectActiveOnly()}>
          {t('print-export:active-only')}
        </Button>
      </Space>
      {store.documents.length === 0 && <Typography.Text type="secondary">{t('print-export:nothing')}</Typography.Text>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '50vh', overflow: 'auto' }}>
        {store.documents.map((doc) => (
          <Checkbox key={doc.id} checked={store.selectedIds.includes(doc.id)} onChange={() => store.toggle(doc.id)}>
            {doc.name}
          </Checkbox>
        ))}
      </div>
    </Modal>
  );
});
