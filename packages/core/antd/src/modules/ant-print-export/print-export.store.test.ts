import { afterEach, describe, expect, it, vi } from 'vitest';
import { schemeFactory, type Scheme } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { buildPdfFileName, PrintExportStore } from './print-export.store.js';
import { PRINT_THEME } from './print-theme.js';
import { settleSchemeLayout } from './settle-scheme-layout.js';
import type { IPrintExportHost, IPrintableDocument } from './print-export.types.js';

const DOCS: IPrintableDocument[] = [
  { id: 'a', name: 'Alpha', isActive: false },
  { id: 'b', name: 'Beta', isActive: true },
  { id: 'c', name: 'Gamma', isActive: false },
];

const setup = (overrides: Partial<IPrintExportHost> = {}) => {
  const built: Scheme[] = [];
  const themes: unknown[] = [];
  const host: IPrintExportHost = {
    projectName: 'My/Project',
    listPrintableDocuments: () => DOCS,
    buildPrintScheme: (_id, theme) => {
      themes.push(theme);
      const scheme = schemeFactory({
        infra: getTestInfrastructure(),
        document: { ...getTestEmptyDoc(), type: 'function' },
        readOnly: true,
      });
      built.push(scheme);
      return scheme;
    },
    savePdf: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  return { host, built, themes, store: new PrintExportStore(host) };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('PrintExportStore selection', () => {
  it('selects every document by default, in order', () => {
    expect(setup().store.selectedIds).toEqual(['a', 'b', 'c']);
  });

  it('supports only-active, all and toggle (order follows the document list)', () => {
    const { store } = setup();
    store.selectActiveOnly();
    expect(store.selectedIds).toEqual(['b']);
    store.toggle('a');
    expect(store.selectedIds).toEqual(['a', 'b']);
    store.toggle('b');
    expect(store.selectedIds).toEqual(['a']);
    store.selectAll();
    expect(store.selectedIds).toEqual(['a', 'b', 'c']);
  });
});

describe('PrintExportStore preview', () => {
  it('builds one page per selected document with the print theme', () => {
    const { store, built, themes } = setup();
    store.toggle('b');
    store.startPreview();
    expect(store.stage).toBe('preview');
    expect(store.pages.map((p) => p.documentId)).toEqual(['a', 'c']);
    expect(themes).toEqual([PRINT_THEME, PRINT_THEME]);
    expect(built[0].theme.value).toBe(PRINT_THEME);
    expect(store.allReady).toBe(false);
    store.dispose();
  });

  it('stays on the selection stage when nothing could be built', () => {
    const { store } = setup({ buildPrintScheme: () => null });
    store.startPreview();
    expect(store.stage).toBe('select');
  });

  it('markMeasured picks a layout, positions the scheme and flips allReady', () => {
    const { store, built } = setup();
    store.toggle('c');
    store.startPreview();
    store.markMeasured('a', { left: 100, right: 100, width: 200, height: 100 });
    expect(store.allReady).toBe(false);
    const page = store.pages[0];
    expect(page.status).toBe('ready');
    expect(page.layout).toMatchObject({ format: 'A4', scale: 1 });
    expect(built[0].viewPosition.x).toBe(100 + 16);
    expect(built[0].viewPosition.y).toBe(16);
    expect(built[0].viewPosition.scale).toBe(1);
    store.dispose();
  });

  it('applies the A1 down-scale through the view position store', () => {
    const { store, built } = setup();
    store.selectActiveOnly();
    store.startPreview();
    store.markMeasured('b', { left: 10_000, right: 10_000, width: 20_000, height: 3000 });
    const scale = store.pages[0].layout?.scale ?? 1;
    expect(scale).toBeLessThan(1);
    expect(built[0].viewPosition.scale).toBe(scale);
    expect(built[0].viewPosition.x).toBeCloseTo(10_000 * scale + 16 * scale);
    store.dispose();
  });

  it('a timed-out page is still printable and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => null);
    const { store } = setup();
    store.selectActiveOnly();
    store.startPreview();
    store.markMeasured('b', null, true);
    expect(store.pages[0].status).toBe('timeout');
    expect(store.allReady).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    store.dispose();
  });

  it('save() refuses until ready, then uses a sanitized project file name', async () => {
    const { store, host } = setup();
    store.selectActiveOnly();
    store.startPreview();
    await expect(store.save()).rejects.toThrow();
    store.markMeasured('b', { left: 10, right: 10, width: 20, height: 20 });
    await store.save();
    expect(host.savePdf).toHaveBeenCalledWith('My_Project.pdf');
    expect(buildPdfFileName('  ')).toBe('schemes.pdf');
    store.dispose();
  });

  it('close/dispose disposes schemes, restores the code theme once and returns to selection', () => {
    const restore = vi.fn();
    const { store, built } = setup({ withLightCodeTheme: () => restore });
    const disposeSpies = [0, 1, 2].map(() => vi.fn());
    store.startPreview();
    store.pages.forEach((page, i) => {
      page.scheme.dispose = disposeSpies[i];
    });
    expect(built).toHaveLength(3);
    store.dispose();
    store.dispose();
    disposeSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(restore).toHaveBeenCalledTimes(1);
    expect(store.stage).toBe('select');
    expect(store.pages).toHaveLength(0);
  });
});

describe('settleSchemeLayout', () => {
  it('resolves ready after the quiet period', async () => {
    vi.useFakeTimers();
    const scheme = schemeFactory({
      infra: getTestInfrastructure(),
      document: { ...getTestEmptyDoc(), type: 'function' },
      readOnly: true,
    });
    const promise = settleSchemeLayout(scheme, { quietMs: 150, maxMs: 3000 });
    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toBe('ready');
    scheme.dispose();
  });
});
