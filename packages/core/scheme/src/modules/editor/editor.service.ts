import { action, makeObservable, observable } from 'mobx';
import type { BlockEditorStore } from '../../store/block-editor.store.js';
import type { IconStore } from '../../store/icon.store.js';
import { CMD_SET_DATA } from '../../scheme/scheme-commands.js';
import type { Scheme } from '../../scheme/scheme.js';
import { resolveService } from '@falang/di';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';

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
