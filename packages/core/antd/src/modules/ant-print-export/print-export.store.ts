import { action, computed, makeObservable, observable } from 'mobx';
import { CELL_SIZE, type Scheme, type ISchemeBounds } from '@falang/scheme';
import { PROVISIONAL_LAYOUT, selectPageFormat, type IPageLayout } from './page-format.js';
import { PRINT_THEME } from './print-theme.js';
import type { IPrintableDocument, IPrintExportHost } from './print-export.types.js';

export type TPrintPageStatus = 'measuring' | 'ready' | 'timeout';

export interface IPrintPage {
  readonly documentId: string;
  readonly name: string;
  readonly scheme: Scheme;
  /** `null` until measured. */
  readonly layout: IPageLayout | null;
  readonly status: TPrintPageStatus;
}

/** `<projectName>.pdf` with path-hostile characters replaced. */
export const buildPdfFileName = (projectName: string): string => {
  // oxlint-disable-next-line no-control-regex
  const clean = projectName.replaceAll(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim();
  return `${clean === '' ? 'schemes' : clean}.pdf`;
};

/** Selection + preview state of the PDF print export (ADR 0048 (private)); host-neutral, see `IPrintExportHost`. */
export class PrintExportStore {
  @observable.ref documents: readonly IPrintableDocument[] = [];
  @observable.ref selectedIds: readonly string[] = [];
  @observable stage: 'select' | 'preview' = 'select';
  @observable.ref pages: readonly IPrintPage[] = [];
  @observable saving = false;
  @observable.ref error: string | null = null;
  @observable.ref printedAt: Date = new Date();

  private restoreCodeTheme: (() => void) | null = null;

  private readonly host: IPrintExportHost;

  constructor(host: IPrintExportHost) {
    this.host = host;
    makeObservable(this);
    this.refresh();
  }

  get projectName(): string {
    return this.host.projectName;
  }

  /** Re-reads the printable documents from the host and selects all of them. Call when opening the modal. */
  @action refresh(): void {
    this.documents = this.host.listPrintableDocuments();
    this.selectedIds = this.documents.map((doc) => doc.id);
  }

  @action selectAll(): void {
    this.selectedIds = this.documents.map((doc) => doc.id);
  }

  @action selectActiveOnly(): void {
    this.selectedIds = this.documents.filter((doc) => doc.isActive).map((doc) => doc.id);
  }

  @action toggle(id: string): void {
    this.selectedIds = this.selectedIds.includes(id)
      ? this.selectedIds.filter((x) => x !== id)
      : this.documents.filter((doc) => doc.id === id || this.selectedIds.includes(doc.id)).map((doc) => doc.id);
  }

  @computed get selectionOrdered(): IPrintableDocument[] {
    return this.documents.filter((doc) => this.selectedIds.includes(doc.id));
  }

  @computed get allReady(): boolean {
    return this.stage === 'preview' && this.pages.length > 0 && this.pages.every((page) => page.status !== 'measuring');
  }

  /** Builds one print scheme per selected document (PRINT_THEME applied) and switches to the preview stage. */
  @action startPreview(): void {
    if (this.stage === 'preview') this.disposePages();
    const pages: IPrintPage[] = [];
    for (const doc of this.selectionOrdered) {
      const scheme = this.host.buildPrintScheme(doc.id, PRINT_THEME);
      if (!scheme) continue;
      scheme.theme.setTheme(PRINT_THEME);
      pages.push({ documentId: doc.id, name: doc.name, scheme, layout: null, status: 'measuring' });
    }
    if (pages.length === 0) return;
    this.restoreCodeTheme ??= this.host.withLightCodeTheme?.() ?? null;
    this.printedAt = new Date();
    this.error = null;
    this.pages = pages;
    this.stage = 'preview';
  }

  /** Layout of one page settled: picks its format/scale and positions the scheme at the content origin. */
  @action markMeasured(documentId: string, bounds: ISchemeBounds | null, timedOut = false): void {
    const page = this.pages.find((p) => p.documentId === documentId);
    if (!page) return;
    const measured = bounds ?? { left: 0, right: 0, width: 0, height: 0 };
    const layout = selectPageFormat(measured, { cellSize: CELL_SIZE });
    const pad = CELL_SIZE * layout.scale;
    page.scheme.viewPosition.setScale(layout.scale);
    page.scheme.viewPosition.setPosition(measured.left * layout.scale + pad, pad);
    // oxlint-disable-next-line no-console
    if (timedOut) console.warn(`Print layout of "${page.name}" did not settle in time; printing it anyway`);
    this.pages = this.pages.map((p) => (p === page ? { ...p, layout, status: timedOut ? 'timeout' : 'ready' } : p));
  }

  /** Layout to render a page with: its measured one, or a provisional A4 while measuring. */
  static layoutOf(page: IPrintPage): IPageLayout {
    return page.layout ?? PROVISIONAL_LAYOUT;
  }

  /** Only valid when `allReady`. */
  async save(): Promise<void> {
    if (!this.allReady) throw new Error('Print pages are not ready yet');
    this.setSaving(true, null);
    try {
      await this.host.savePdf(buildPdfFileName(this.host.projectName));
      this.setSaving(false, null);
    } catch (error) {
      this.setSaving(false, error instanceof Error ? error.message : String(error));
    }
  }

  @action private setSaving(saving: boolean, error: string | null): void {
    this.saving = saving;
    this.error = error;
  }

  @action private disposePages(): void {
    for (const page of this.pages) page.scheme.dispose();
    this.pages = [];
  }

  /** Back to the selection stage: disposes the print schemes and restores the code theme. */
  @action close(): void {
    this.disposePages();
    this.restoreCodeTheme?.();
    this.restoreCodeTheme = null;
    this.stage = 'select';
  }

  dispose(): void {
    this.close();
  }
}
