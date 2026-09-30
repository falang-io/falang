import type { ITheme, Scheme } from '@falang/scheme';

export interface IPrintableDocument {
  readonly id: string;
  readonly name: string;
  /** The document open in the active tab (drives "Active document only"). */
  readonly isActive: boolean;
}

/** What a host (workflow client, desktop apps) supplies to `PrintExportStore`. */
export interface IPrintExportHost {
  readonly projectName: string;
  /** Scheme-bearing documents only (never `integrations`/`Devices`), in project tree order. */
  listPrintableDocuments(): IPrintableDocument[];
  /**
   * A read-only, module-less scheme for the document, built from its current DTO (the live scheme's
   * `getDto` when open in a tab, else the stored root) with `theme` applied. `null` when it can't be built.
   */
  buildPrintScheme(documentId: string, theme: ITheme): Scheme | null;
  /** Writes the PDF (desktop: `printToPDF` + save dialog; browser: `window.print()`). */
  savePdf(suggestedFileName: string): Promise<void>;
  /** Forces light code colouring while the layer is open; returns the restore function. */
  withLightCodeTheme?(): () => void;
}
