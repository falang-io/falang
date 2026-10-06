import { resolveService } from '@falang/di';
import type { INode } from '@falang/dto';
import { toJS } from 'mobx';
import type { Scheme } from '../../scheme/scheme.js';
import { CMD_INSERT_NODE } from '../../scheme/scheme-commands.js';
import { getDto } from '../../utils/get-dto.js';
import { TOKEN_HISTORY } from '../history/history.store.token.js';
import { TOKEN_ICONS_TRANSFER_SERVICE } from '../icons-transfer/icons-transfer.service.token.js';
import { cloneWithNewIds, generateNodeId, isAllowedChild } from './copy-paste.utils.js';
import {
  SCHEME_CLIPBOARD_FORMAT,
  type ICopyPasteModuleParams,
  type ICopyPasteOrigin,
  type ISchemeClipboard,
  type ISchemeClipboardPayload,
  defaultSchemeClipboard,
} from './copy-paste.types.js';

const sameOrigin = (source: ICopyPasteOrigin, target: ICopyPasteOrigin): boolean =>
  source.projectType === target.projectType && source.documentType === target.documentType;

/** Copies icons (whole node subtrees) of one scheme to a clipboard and pastes them back with fresh ids. */
export class CopyPasteService {
  readonly origin: ICopyPasteOrigin;
  private readonly clipboard: ISchemeClipboard;
  private readonly canPasteFrom: (source: ICopyPasteOrigin, target: ICopyPasteOrigin) => boolean;
  private readonly scheme: Scheme;
  /** Id generator for pasted nodes — replaceable in tests. */
  createId: () => string = generateNodeId;

  constructor(scheme: Scheme, params: ICopyPasteModuleParams) {
    this.scheme = scheme;
    this.origin = { projectType: params.projectType, documentType: params.documentType };
    this.clipboard = params.clipboard ?? defaultSchemeClipboard;
    this.canPasteFrom = params.canPasteFrom ?? sameOrigin;
  }

  /**
   * A node is copyable when it is a regular child of its parent (not the root, a mod or an `out`) and the parent
   * holds a free list of children — a fixed tuple slot (`function-header`, an `if` branch) can never be pasted.
   */
  canCopy(id: string): boolean {
    const node = this.scheme.nodes.get(id);
    const parent = node?.parent;
    if (!node || !parent) return false;
    if (!parent.children.includes(node)) return false;
    const config = this.scheme.infra.structure.configsMap.get(parent.name);
    return Boolean(config?.children);
  }

  /**
   * What "Copy" on `iconId` copies: the current icons-transfer selection when the icon belongs to it (in list
   * order), otherwise just that icon. Empty when nothing there is copyable.
   */
  getCopyIds(iconId: string): string[] {
    const selected = this.getSelectedIds();
    const ids = selected.includes(iconId) ? [...selected] : [iconId];
    return ids.every((id) => this.canCopy(id)) ? ids : [];
  }

  /** Writes the subtrees of `ids` to the clipboard. Returns the payload, or `null` when nothing was copyable. */
  copy(ids: readonly string[]): ISchemeClipboardPayload | null {
    if (ids.length === 0 || !ids.every((id) => this.canCopy(id))) return null;
    const payload: ISchemeClipboardPayload = {
      format: SCHEME_CLIPBOARD_FORMAT,
      version: 1,
      ...this.origin,
      nodes: ids.map((id) => toJS(getDto(id, this.scheme))),
    };
    this.clipboard.write(payload);
    return payload;
  }

  /** The clipboard payload, if it may be pasted into this scheme at all (format and origin). */
  getPastePayload(): ISchemeClipboardPayload | null {
    const payload = this.clipboard.read();
    if (!payload || payload.format !== SCHEME_CLIPBOARD_FORMAT || payload.nodes.length === 0) return null;
    if (!this.canPasteFrom({ projectType: payload.projectType, documentType: payload.documentType }, this.origin)) {
      return null;
    }
    return payload;
  }

  /** Whether the clipboard's nodes may be inserted as children of `parentId` starting at `index`. */
  canPasteAt(parentId: string, index: number): boolean {
    if (!this.scheme.isEditing) return false;
    const payload = this.getPastePayload();
    if (!payload) return false;
    const parent = this.scheme.nodes.get(parentId);
    if (!parent || index < 0 || index > parent.children.length) return false;
    if (
      !payload.nodes.every(
        (node) => isAllowedChild(this.scheme.infra.structure, parent.name, node.name) && this.isKnownTree(node),
      )
    ) {
      return false;
    }
    // The first child of a list continues its parent's main path and can never jump (`canHaveOut`).
    return !(index === 0 && payload.nodes[0].out);
  }

  /**
   * Inserts the clipboard's nodes under `parentId` at `index`, every node id replaced by a fresh one (so the same
   * clipboard can be pasted any number of times), as one undo step when `HistoryModule` is present. Returns the new
   * top-level ids, empty when pasting there isn't allowed.
   */
  paste(parentId: string, index: number): string[] {
    if (!this.canPasteAt(parentId, index)) return [];
    const payload = this.getPastePayload();
    if (!payload) return [];
    const nodes = payload.nodes.map((node) => cloneWithNewIds(node, this.createId));
    const insert = () => {
      nodes.forEach((node, offset) => {
        this.scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId, index: index + offset, node });
      });
    };
    if (this.scheme.container.isRegistered(TOKEN_HISTORY, true)) {
      resolveService(TOKEN_HISTORY, this.scheme.container).runGrouped(insert);
    } else {
      insert();
    }
    return nodes.map((node) => node.id);
  }

  private getSelectedIds(): readonly string[] {
    if (!this.scheme.container.isRegistered(TOKEN_ICONS_TRANSFER_SERVICE, true)) return [];
    return resolveService(TOKEN_ICONS_TRANSFER_SERVICE, this.scheme.container).selectedIds;
  }

  /** Every node of the subtree is a kind this scheme's stack knows (a payload may come from another scheme). */
  private isKnownTree(node: INode): boolean {
    if (!this.scheme.infra.structure.configsMap.has(node.name)) return false;
    const nested = [...(node.children ?? []), ...(node.mods ?? []), ...(node.out ? [node.out] : [])];
    return nested.every((child) => this.isKnownTree(child));
  }
}
