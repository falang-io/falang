import { action, runInAction } from 'mobx';
import { checker } from '../checker';
import { IconStore } from '../icons/base/Icon.store';
import { SchemeStore } from './Scheme.store';

export class IconsMouseEvents {
  constructor(readonly scheme: SchemeStore) { }

  dispose() {

  }

  @action onClick(
    e: React.MouseEvent<SVGGElement, MouseEvent>,
    icon: IconStore,
  ) {
    e.stopPropagation();
    if (this.scheme.state === 'edit-icon') return;
    this.scheme.selection.iconOnClick(icon, e.shiftKey);
    /*const selection = this.scheme.selection;
    if(e.shiftKey && this.scheme.selection.selectedIconsIds.length > 0) {
      const parentId = icon.parentId;
      const firstSelected = this.scheme.selection.getSelectedIcons()[0];
      const selectedParentId = firstSelected.parentId;
      if(parentId && parentId === selectedParentId) {
        const parent = this.scheme.icons.get(parentId);
        if(checker.isIconWithList(parent)) {
          const clickedIconIndex = parent.list.iconsIds.indexOf(icon.id)
          const firstSelectedIconIndex = parent.list.iconsIds.indexOf(firstSelected.id);
          if(clickedIconIndex !== -1 && firstSelectedIconIndex !== -1 && clickedIconIndex !== firstSelectedIconIndex) {
            const firstIndex = Math.min(clickedIconIndex, firstSelectedIconIndex);
            const lastIndex = Math.max(clickedIconIndex, firstSelectedIconIndex);
            const newSelectedIds = parent.list.iconsIds.slice(firstIndex, lastIndex);
            this.scheme.selection.setSelectedIconsIds(
              this.scheme.selection.selectedIconsIds.slice().concat(...newSelectedIds),
            );
            return;
          }          
        }
      }
    }
    selection.setSelectedIcon(icon.id);   
    runInAction(() => {
      this.scheme.state = 'selected';
    });*/
  }

  onMouseDown(
    e: React.MouseEvent<SVGGElement, MouseEvent>,
    icon: IconStore,
  ) {
    if (!this.scheme.isEditing) return;
    if (!this.scheme.selection.iconOnMouseDown(icon, e.shiftKey)) {
      console.log(1);
      this.scheme.dnd.prepareDrag();
    } else if (this.scheme.selection.selectedIconsIds.length === 1) {
      console.log(2);
      this.scheme.dnd.prepareDrag();
    }
    e.stopPropagation();
    /*let selectedIds = this.scheme.selection.selectedIconsIds;
    if(!selectedIds.includes(icon.id) && !e.shiftKey) {
      selectedIds = [icon.id];
      this.scheme.selection.setSelectedIconsIds(selectedIds);
    }*/

  }

  onDoubleClick(
    e: React.MouseEvent<SVGGElement, MouseEvent>,
    icon: IconStore,
  ) {
    e.stopPropagation();
    if (!icon.scheme.isEditing) return;
    if (!icon.block.editable) return;
    icon.scheme.editing.startEdit(icon);
  }

  onMouseUp(
    e: React.MouseEvent<SVGGElement, MouseEvent>,
    icon: IconStore,
  ) {
    if (this.scheme.state === 'selected') e.stopPropagation();
  }

  onContextMenu(
    e: React.MouseEvent<SVGGElement, MouseEvent>,
    icon: IconStore,
  ) {
    if (!this.scheme.isEditing) return;
    const contextMenu = this.scheme.infrastructure.getContextMenuForIcon(icon);
    if (icon.isInList()) {
      contextMenu.unshift({
        text: this.scheme.frontRoot.lang.t('app:copy'),
        onClick: () => this.scheme.copyIconsToClipboard(),
      });
    }
    contextMenu.push(...icon.transformer.getContextMenu(icon));
    if (!contextMenu.length) return;
    this.scheme.frontRoot.contextMenu.showMenu(contextMenu, e.clientX, e.clientY);
  }

  onMouseOver(
    e: React.MouseEvent<SVGGElement, MouseEvent>,
    icon: IconStore,
  ) { }

}