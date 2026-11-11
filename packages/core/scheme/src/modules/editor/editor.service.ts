import { action, makeObservable, observable, toJS } from 'mobx';
import type { BlockEditorStore } from '../../store/block-editor.store.js';
import type { IconStore } from '../../store/icon.store.js';
import { CMD_SET_DATA } from '../../scheme/scheme-commands.js';
import type { Scheme } from '../../scheme/scheme.js';
import { resolveService } from '@falang/di';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from './editor.service.token.js';

export class EditorService {
  @observable editingId: string | null = null;
  @observable editingStore: BlockEditorStore | null = null;

  constructor() {
    makeObservable(this);
  }

  @action setIconForEdit(icon: IconStore, scheme: Scheme) {
    const editingStore =
      icon.config.block.editor?.editorFactory({ container: scheme.container, data: icon.dataNode.data, icon }) ?? null;
    if (!editingStore) {
      return false;
    }
    this.editingId = icon.id;
    this.editingStore = editingStore;
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    cssClasses.removeClassFromAllBlocks('selected');
    cssClasses.addBlockClass(icon.id, 'selected');
    return true;
  }

  /**
   * Writes the open editor's current data into the node without closing the editor — for a host that is about to
   * read the document (build, publish) while the user may still be typing in a block editor. No-op when nothing is
   * being edited or the data is unchanged. Returns whether data was written.
   */
  @action commitEdit(scheme: Scheme): boolean {
    if (!this.editingStore || !this.editingId) return false;
    const node = scheme.nodes.getNodeSafe(this.editingId);
    if (!node) return false;
    const data = this.editingStore.getData();
    if (JSON.stringify(toJS(data)) === JSON.stringify(toJS(node.data))) return false;
    scheme.commands.dispatchCommand(CMD_SET_DATA, { data, id: this.editingId });
    return true;
  }

  /** Disposes the open editor without writing its data or touching the scheme (for a scheme being disposed). */
  @action discardEdit() {
    this.editingStore?.dispose();
    this.editingId = null;
    this.editingStore = null;
  }

  @action stopEdit(scheme: Scheme, save?: boolean) {
    if (this.editingStore && this.editingId && save) {
      scheme.commands.dispatchCommand(CMD_SET_DATA, {
        data: this.editingStore.getData(),
        id: this.editingId,
      });
    }
    this.editingStore?.dispose();
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    cssClasses.removeClassFromAllBlocks('selected');
    this.editingId = null;
    this.editingStore = null;
  }
}

/** `EditorService.commitEdit` for a scheme that may have no inline editor (read-only, module-less schemes). */
export const commitInlineEdit = (scheme: Scheme): boolean => {
  if (!scheme.container.isRegistered(TOKEN_INLINE_EDITOR_SERVICE, true)) return false;
  return resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container).commitEdit(scheme);
};
