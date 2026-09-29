import { action, makeObservable, observable } from 'mobx';
import { resolveService } from '@falang/di';
import type { IconStore } from '../../store/icon.store.js';
import type { Scheme } from '../../scheme/scheme.js';
import { CELL_SIZE_2 } from '../../constants.js';
import { DEFAULT_MODES } from '../../types/toolbar-icon.js';
import { CMD_SET_META } from '../../scheme/scheme-commands.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from '../editor/editor.service.token.js';
import { ICON_RESIZING_MODE_NAME } from './constants.js';

export class BlockResizeService {
  @observable hoveredIconId: string | null = null;
  @observable private startX = 0;
  @observable private startWidth = 0;

  constructor() {
    makeObservable(this);
  }

  isResizable(icon: IconStore): boolean {
    return icon.config.block.resizable !== false;
  }

  getHandleIcon(scheme: Scheme): IconStore | null {
    if (!scheme.isEditing || !this.hoveredIconId) return null;
    if (this.isIconBeingEdited(this.hoveredIconId, scheme)) return null;
    const icon = scheme.icons.getIconSafe(this.hoveredIconId);
    if (!icon || !this.isResizable(icon)) return null;
    return icon;
  }

  private isIconBeingEdited(iconId: string, scheme: Scheme): boolean {
    if (!scheme.container.isRegistered(TOKEN_INLINE_EDITOR_SERVICE, true)) return false;
    const editorService = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
    return editorService.editingId === iconId;
  }

  @action setHoveredIcon(icon: IconStore, scheme: Scheme): boolean {
    if (scheme.mode.value === ICON_RESIZING_MODE_NAME) return false;
    this.hoveredIconId = icon.id;
    return false;
  }

  @action startResize(icon: IconStore, scheme: Scheme): boolean {
    if (!this.isResizable(icon)) return false;
    this.hoveredIconId = icon.id;
    this.startX = scheme.mousePosition.x;
    this.startWidth = icon.blockWidth;
    scheme.mode.setMode(ICON_RESIZING_MODE_NAME);
    return true;
  }

  @action updateResize(scheme: Scheme): boolean {
    if (scheme.mode.value !== ICON_RESIZING_MODE_NAME || !this.hoveredIconId) return false;
    const icon = scheme.icons.getIconSafe(this.hoveredIconId);
    if (!icon) return false;
    const deltaX = scheme.mousePosition.x - this.startX;
    const steps = Math.round(deltaX / CELL_SIZE_2);
    const newWidth = Math.max(CELL_SIZE_2, this.startWidth + steps * CELL_SIZE_2);
    icon.setBlockWidth(newWidth);
    return true;
  }

  @action finishResize(scheme: Scheme): boolean {
    if (scheme.mode.value !== ICON_RESIZING_MODE_NAME) return false;
    const iconId = this.hoveredIconId;
    if (iconId) {
      const icon = scheme.icons.getIconSafe(iconId);
      const node = scheme.nodes.getNode(iconId);
      if (icon) {
        scheme.commands.dispatchCommand(CMD_SET_META, {
          id: iconId,
          meta: { ...node.meta, width: icon.blockWidth },
        });
      }
    }
    scheme.mode.setMode(DEFAULT_MODES.START);
    return true;
  }
}
