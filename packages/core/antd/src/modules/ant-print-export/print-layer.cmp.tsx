import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { Alert, Button } from 'antd';
import { buildPrintPagesCss, buildPrintPreviewCss, mmToPx } from './page-format.js';
import { PrintPage } from './print-page.cmp.js';
import { PrintExportStore } from './print-export.store.js';
import { usePrintExportT } from './use-print-export-t.js';

const PRINT_LAYER_CSS = `
.falang-print-page { position: relative; overflow: hidden; box-sizing: border-box; background: white; width: 210mm; height: 297mm; }
@media screen {
  .falang-print-root { position: fixed; inset: 0; z-index: 3000; background: #525659; overflow: auto; display: flex; flex-direction: column; align-items: center; padding: 72px 24px 24px; box-sizing: border-box; }
  .falang-print-page { transform: scale(var(--falang-print-k, 1)); transform-origin: 0 0; box-shadow: 0 2px 12px rgba(0,0,0,0.5); flex: none; }
  .falang-print-label { color: #ddd; font: 12px sans-serif; margin: 8px 0 4px; }
  .falang-print-toolbar { position: fixed; top: 0; left: 0; right: 0; height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 24px; background: #2b2d30; z-index: 1; }
}
@media print {
  html, body { height: auto !important; overflow: visible !important; margin: 0 !important; }
  body > :not(.falang-print-root) { display: none !important; }
  .falang-print-root { position: static !important; overflow: visible !important; display: block !important; }
  .falang-print-chrome { display: none !important; }
}`;

export interface IPrintLayerProps {
  readonly store: PrintExportStore;
  /** Called after the layer closed itself (`store.close()` already ran). */
  readonly onClose?: () => void;
}

/**
 * Full-screen print preview, portalled to `document.body` so the print stylesheet can hide everything else.
 * Renders nothing unless `store.stage === 'preview'`. `data-testid`s: `print-layer`, `print-sheet`, `print-save`, `print-close`.
 */
export const PrintLayer: React.FC<IPrintLayerProps> = observer(({ store, onClose }) => {
  const t = usePrintExportT();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const pages = store.pages;
  const visible = store.stage === 'preview';
  const widestPx = Math.max(0, ...pages.map((page) => mmToPx(PrintExportStore.layoutOf(page).widthMm)));

  useEffect(() => {
    if (!visible) return;
    const update = (): void => {
      const width = rootRef.current?.clientWidth ?? window.innerWidth;
      setPreviewScale(Math.max(0.1, Math.min(1, (width - 48) / Math.max(widestPx, 1))));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [visible, widestPx]);

  if (!visible) return null;
  const layouts = pages.map((page) => page.layout);
  const close = (): void => {
    store.close();
    onClose?.();
  };

  return createPortal(
    <div
      ref={rootRef}
      className="falang-print-root"
      data-testid="print-layer"
      style={{ '--falang-print-k': previewScale } as React.CSSProperties}
    >
      <style>{`${PRINT_LAYER_CSS}\n${buildPrintPagesCss(layouts)}\n${buildPrintPreviewCss(layouts)}\n.falang-print-page-last { break-after: auto; }`}</style>
      <div className="falang-print-chrome falang-print-toolbar">
        <Button
          type="primary"
          data-testid="print-save"
          disabled={!store.allReady}
          loading={store.saving}
          onClick={() => {
            store.save().catch(() => null);
          }}
        >
          {t('print-export:save-pdf')}
        </Button>
        <Button data-testid="print-close" onClick={close}>
          {t('print-export:close')}
        </Button>
        {store.error && <Alert type="error" showIcon message={store.error} />}
      </div>
      {pages.map((page, index) => (
        <PrintPage key={page.documentId} store={store} page={page} index={index} total={pages.length} />
      ))}
    </div>,
    document.body,
  );
});
