import { ObservableSet, action, computed, makeObservable, observable } from 'mobx';
import { checker } from '../checker';
import { IconStore } from '../icons/base/Icon.store';
import { OutStore } from '../common/outs/Out.store';
import { SchemeStore } from './Scheme.store';
import { IValencePointsRegisterItem } from './ValencePointsRegisterer.store';

export type TKeyboardMode = 'insert' | 'overtype';

export class SelectionStore {
  @observable private _mode: TKeyboardMode = 'overtype';
  private readonly _selectedIconsIds = new ObservableSet<string>();
  @observable private _selectedValencePoint: IValencePointsRegisterItem | null = null;

  constructor(readonly scheme: SchemeStore) {
    makeObservable(this);
  }

  @action reset(): void {
    this._selectedIconsIds.clear();
  }

  @action dispose(): void {
    this.reset();
  }

  @computed get mode() {
    return this._mode;
  }

  @action toggleKeyboardMode() {
    if (this._mode === 'overtype') {
      this.setInsertMode();
    } else {
      this.setOvertypeMode();
    }
  }

  @action setInsertMode() {
    if (this._mode === 'insert') {
      this.selectFirstValencePoint();
      return;
    }
    if (this._selectedIconsIds.size === 0) {
      this.selectFirstValencePoint();
      return;
    };
    const firstSelectedId = this._selectedIconsIds.values().next()?.value;
    if (!firstSelectedId) {
      this.selectFirstValencePoint();
      return;
    }
    const icon = this.scheme.icons.get(firstSelectedId);
    const parent = icon.parent;
    if (!parent || !checker.isIconWithList(parent)) {
      this.selectFirstValencePoint();
      return;
    }
    const index = parent.list.iconsIds.indexOf(icon.id);
    this._mode = 'insert';
    if(index >= 0) {
      this.selectValencePoint(parent.id, index);
      return;
    }
    const parentParent = parent.parent;
    if (!parentParent || !checker.isIconWithList(parentParent)) {
      this.selectFirstValencePoint();
      return;
    }
    const parentIndex = parentParent.list.iconsIds.indexOf(parent.id);
    if (parentIndex === -1) {
      this.selectFirstValencePoint();
      return;
    }
    this.selectValencePoint(parentParent.id, parentIndex);
  }

  private selectValencePoint(parentId: string, index: number) {
    const vp = this.scheme.valencePoints.visibleValencePoints.find((vp) => vp.parentId === parentId && vp.index === index);
    if(!vp) {
      this.selectFirstValencePoint();
      return;
    }
    this._selectedValencePoint = vp;
  }

  private selectFirstValencePoint() {
    const root = this.scheme.root;
    if(!checker.isIconWithList(root)) {
      const vp = this.scheme.valencePoints.visibleValencePoints[0];
      this._selectedValencePoint = vp;
    }
    const vp = this.scheme.valencePoints.visibleValencePoints.find((vp) => vp.parentId === root.id && vp.index === 0);
    if(!vp) {
      console.error('first valence point not found');
      return;
    }
    this._selectedValencePoint = vp;
  }

  @action setOvertypeMode() {
    if (this._mode === 'overtype') return;
    this._mode = 'overtype';
    const vp = this._selectedValencePoint;
    const parentId = vp?.parentId;
    if (this._selectedIconsIds.size > 0 || !vp || !parentId) return;
    this._selectedValencePoint = null;
    const parent = this.scheme.icons.get(parentId);
    if (!checker.isIconWithList(parent)) return;
    const listIds = parent.list.iconsIds;
    const index = vp.index;
    if (index === null) return;
    const nextId = listIds[index + 1];
    const prevId = listIds[index - 1];
    const selectId = nextId ?? prevId;
    if (!selectId) return;
    this.setSelectedIconsIds([selectId]);
  }

  get selectedIconsIds(): ReadonlyArray<string> {
    const returnValue: string[] = [];
    this._selectedIconsIds.forEach((id) => returnValue.push(id));
    return returnValue;
  }

  @computed get onlySelectedIcon(): IconStore | null {
    if (this._selectedIconsIds.size !== 1) return null;
    return this.firstSelectedIcon;
  }

  @computed get firstSelectedIcon(): IconStore | null {
    if (this._selectedIconsIds.size === 0) return null;
    return this.scheme.icons.getSafe(this._selectedIconsIds.values().next().value);
  }

  @computed get isSomeSelected(): boolean {
    return !!this._selectedIconsIds.size;
  }

  getSelectedIcons(): IconStore[] {
    const returnValue: IconStore[] = [];
    this._selectedIconsIds.forEach(iconId => {
      const icon = this.scheme.icons.getSafe(iconId);
      if (icon) {
        returnValue.push(icon);
      }
    });
    return returnValue;
  }

  isIconSelected(id: string): boolean {
    return this._selectedIconsIds.has(id);
  }

  @action iconOnMouseDown(icon: IconStore, shiftKey: boolean): boolean {
    if (icon.isInSelected) return false;
    if (!this.scheme.isEditing) return false;
    const selectedIcons = this.getSelectedIcons();
    if (!selectedIcons.length) {
      this.setSelectedIconsIds([icon.id]);
      this.scheme.state = 'selected';
      return true;
    }
    const currentParent = icon.parent;
    const selectedParent = selectedIcons[0].parent;
    if (!currentParent || !selectedParent) {
      this.setSelectedIconsIds([icon.id]);
      this.scheme.state = 'selected';
      return true;
    }
    if (
      shiftKey
      && currentParent.id === selectedParent.id
      && checker.isIconWithSkewer(currentParent)
    ) {
      const parentIconsIds = currentParent.skewer.iconsIds;
      const indexes: number[] = [];
      for (const selectedId of this._selectedIconsIds) {
        indexes.push(parentIconsIds.indexOf(selectedId));
      }
      indexes.sort((a, b) => a - b);
      const firstIndex = indexes[0];
      const lastIndex = indexes[indexes.length - 1];
      const mouseDownIconIndex = parentIconsIds.indexOf(icon.id);
      if (mouseDownIconIndex < 0 || firstIndex < 0 || lastIndex < 0) {
        console.error({
          mouseDownIconIndex,
          firstIndex,
          lastIndex,
        });
        return false;
      }
      let selectedFromIndex: number;
      let selectedToIndex: number;
      if (mouseDownIconIndex < firstIndex) {
        selectedFromIndex = mouseDownIconIndex;
        selectedToIndex = firstIndex;
      } else if (mouseDownIconIndex > lastIndex) {
        selectedFromIndex = lastIndex;
        selectedToIndex = mouseDownIconIndex;
      } else {
        console.error({
          mouseDownIconIndex,
          firstIndex,
          lastIndex,
        });
        return false;
      }
      const newSelectedIds = parentIconsIds.slice(selectedFromIndex, selectedToIndex + 1);
      this.setSelectedIconsIds(newSelectedIds);
    } else {
      this.setSelectedIconsIds([icon.id]);
    }
    this.scheme.state = 'selected';
    return true;
  }

  @action iconOnClick(icon: IconStore, shiftKey: boolean) {
    if (!this.scheme.isEditing) return;
    if (this.onlySelectedIcon?.id === icon.id) return;
    if (shiftKey && this._selectedIconsIds.has(icon.id)) return;
    this.setSelectedIconsIds([icon.id]);
    this.scheme.state = 'selected';
  }

  @action setSelectedIconsIds(ids: readonly string[]) {
    this._mode = 'overtype';
    this._selectedIconsIds.replace(ids);
  }

  @action dropSelection() {
    this._selectedIconsIds.clear();
  }

  setSelectedIcon(iconId: string) {
    this.setSelectedIconsIds([iconId]);
  }

  addSelectedIcon(iconId: string) {
    this._selectedIconsIds.add(iconId);
  }

  @computed get highlightTag(): string | null {
    const selectedIconsIds = this.selectedIconsIds;
    if (selectedIconsIds.length !== 1) return null;
    const selectedIcon = this.scheme.icons.getSafe(selectedIconsIds[0]);
    if (!(selectedIcon instanceof OutStore)) return null;
    const targetId = selectedIcon.targetId;
    if (!targetId) return null;

    const targetOutItem = this.scheme.icons.get(targetId);
    if (!targetOutItem) return null;

    return `${targetId}`;
  }

  isHighlighted(type: string, id: string) {
    return this.highlightTag === `${id}`;
  }
}

