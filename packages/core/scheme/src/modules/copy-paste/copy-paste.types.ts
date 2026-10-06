import type { INode } from '@falang/dto';

/** Where copied icons come from / are pasted into: the project type and the document type of the scheme. */
export interface ICopyPasteOrigin {
  projectType: string;
  documentType: string;
}

export const SCHEME_CLIPBOARD_FORMAT = 'falang/scheme-nodes';

/** What `Copy` puts on the clipboard: the copied nodes (whole subtrees, in order) plus where they came from. */
export interface ISchemeClipboardPayload extends ICopyPasteOrigin {
  format: typeof SCHEME_CLIPBOARD_FORMAT;
  version: 1;
  nodes: INode[];
}

/**
 * Storage for copied icons. Synchronous on purpose: the context menu decides whether to offer "Paste" while it is
 * being built. The default (`defaultSchemeClipboard`) is one in-memory clipboard per JS realm, shared by every
 * scheme of the window — a host can pass its own (e.g. backed by `localStorage` to share between windows).
 */
export interface ISchemeClipboard {
  read(): ISchemeClipboardPayload | null;
  write(payload: ISchemeClipboardPayload): void;
}

export interface ICopyPasteModuleParams extends ICopyPasteOrigin {
  clipboard?: ISchemeClipboard;
  /**
   * Whether nodes copied from `source` may be pasted into a scheme of `target`. Defaults to "same project type and
   * same document type". The structural checks (node kinds known to the target, the parent's children policy, the
   * first-child-out rule) apply either way.
   */
  canPasteFrom?: (source: ICopyPasteOrigin, target: ICopyPasteOrigin) => boolean;
}

export class MemorySchemeClipboard implements ISchemeClipboard {
  private payload: ISchemeClipboardPayload | null = null;

  read(): ISchemeClipboardPayload | null {
    return this.payload;
  }

  write(payload: ISchemeClipboardPayload): void {
    this.payload = payload;
  }
}

/** The clipboard `CopyPasteModule` uses when the host passes none — shared by every scheme in this JS realm. */
export const defaultSchemeClipboard: ISchemeClipboard = new MemorySchemeClipboard();
