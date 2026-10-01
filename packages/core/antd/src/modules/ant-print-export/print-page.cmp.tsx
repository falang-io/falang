import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { getSchemeBounds, SchemeComponent } from '@falang/scheme';
import { PRINT_HEADER_MM, PRINT_MARGIN_MM, printPageClassName } from './page-format.js';
import { PrintExportStore, type IPrintPage } from './print-export.store.js';
import { settleSchemeLayout } from './settle-scheme-layout.js';
import { usePrintExportT } from './use-print-export-t.js';

export interface IPrintPageProps {
  readonly store: PrintExportStore;
  readonly page: IPrintPage;
  /** 0-based position in the printed document. */
  readonly index: number;
  readonly total: number;
}

/** One sheet: a label (screen only), then the page box — header line plus the scheme's content area. */
export const PrintPage: React.FC<IPrintPageProps> = observer(({ store, page, index, total }) => {
  const t = usePrintExportT();
  const layout = PrintExportStore.layoutOf(page);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      await document.fonts?.ready;
      if (cancelled) return;
      const result = await settleSchemeLayout(page.scheme);
      if (cancelled) return;
      store.markMeasured(page.documentId, getSchemeBounds(page.scheme), result === 'timeout');
    };
    run().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [page.scheme, page.documentId, store]);

  const scaleLabel = layout.scale < 1 ? ` · ${Math.round(layout.scale * 100)} %` : '';
  const label =
    page.status === 'measuring'
      ? t('print-export:measuring')
      : `${layout.format} · ${t(`print-export:${layout.orientation}`)}${scaleLabel}${page.status === 'timeout' ? ` · ${t('print-export:timeout')}` : ''}`;

  return (
    <>
      <div className="falang-print-chrome falang-print-label" data-testid="print-sheet-label">
        {page.name} — {label}
      </div>
      <div
        className={`falang-print-page ${printPageClassName(index)}${index === total - 1 ? ' falang-print-page-last' : ''}`}
        data-testid="print-sheet"
        data-format={layout.format}
        data-orientation={layout.orientation}
        data-scale={layout.scale}
        data-status={page.status}
      >
        <div
          style={{
            position: 'absolute',
            left: `${PRINT_MARGIN_MM}mm`,
            right: `${PRINT_MARGIN_MM}mm`,
            top: `${PRINT_MARGIN_MM}mm`,
            height: `${PRINT_HEADER_MM}mm`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'Arial, sans-serif',
            fontSize: '10px',
            color: '#000',
          }}
        >
          <strong>{page.name}</strong>
          <span style={{ color: '#666' }}>
            {store.projectName} · {store.printedAt.toLocaleDateString()} · {index + 1}/{total}
          </span>
        </div>
        <div
          style={{
            position: 'absolute',
            left: `${PRINT_MARGIN_MM}mm`,
            top: `${PRINT_MARGIN_MM + PRINT_HEADER_MM}mm`,
            width: `${layout.widthMm - 2 * PRINT_MARGIN_MM}mm`,
            height: `${layout.heightMm - 2 * PRINT_MARGIN_MM - PRINT_HEADER_MM}mm`,
            overflow: 'hidden',
            // Every domain factory registers MouseNavigationModule: a wheel over the preview would zoom/pan the
            // print scheme and shift what gets printed. The sheet is static, so it takes no mouse input at all.
            pointerEvents: 'none',
          }}
        >
          <SchemeComponent scheme={page.scheme} />
        </div>
      </div>
    </>
  );
});
