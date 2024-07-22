import { action, computed, makeObservable, observable, reaction, runInAction } from 'mobx';
import { IconStore } from '../icons/base/Icon.store';
import { FrontRootStore, IDomRect } from '@falang/frontend-core';
import { InfrastructureType } from '../infrastructure/InfrastructureType';
import { IconsMouseEvents } from './IconsMouseEvents';
import { TIconRenderer } from '../infrastructure/IInfrastructureConfig';
import { ISchemeDto } from './Scheme.dto';
import { MouseEventsService } from './MouseEvents.service';
import { MousePositionStore } from './MousePosition.store';
import { IconsRegistryStore } from './IconsRegistry.store';
import { ViewPositionStore } from './ViewPosition.store';
import { ValencePointsRegistererStore } from './ValencePointsRegisterer.store';
import { SelectionStore } from './Selection.store';
import { DragStore } from './Drag.store';
import { EditingStore } from './Editing.store';
import { OutsRegisterer } from '../common/outs/OutsRegisterer';
import { IconDto } from '../icons/base/Icon.dto';
import { checker } from '../checker';
import { IIconList } from '../icons/base/IIconList';
import { HistoryStore, IHistoryStoreItem } from './History.store';
import { nanoid } from 'nanoid';
import { GapModifyStore } from './GapModify.store';
import { CELL_SIZE } from '../common/constants';
import { IconResizerStore } from '../common/blocks/icon-resizer/IconResizerState';
import { ProjectStore } from '../project/ProjectStore';
import { SheduleCallbackStore } from './SheduleCallback.store';
import { IconsEnumeratorStore } from './IconsEnumerator.store';

export type TSchemeMode = 'view' | 'edit';
export type TSchemeState = 'start' | 'selected' | 'edit-icon' | 'drag-icons' | 'moving' | 'animation' | 'resize-block' | 'resize-gap';

export class SchemeStore<TInfrastructureType extends InfrastructureType = InfrastructureType> {
  readonly sheduleCallback = new SheduleCallbackStore();
  readonly icons: IconsRegistryStore = new IconsRegistryStore();
  readonly viewPosition = new ViewPositionStore();
  readonly selection: SelectionStore = new SelectionStore(this);
  readonly dnd: DragStore = new DragStore(this);
  readonly valencePoints: ValencePointsRegistererStore = new ValencePointsRegistererStore(this);
  readonly editing: EditingStore = new EditingStore(this);
  readonly iconMouseEvents: IconsMouseEvents = new IconsMouseEvents(this);
  readonly mouseEvents: MouseEventsService = new MouseEventsService(this);
  readonly mousePosition: MousePositionStore = new MousePositionStore();
  readonly iconResizer: IconResizerStore = new IconResizerStore(this);
  readonly outs: OutsRegisterer = new OutsRegisterer(this);
  readonly history = new HistoryStore();
  readonly gapModify: GapModifyStore = new GapModifyStore(this);
  readonly enumeratorStore = new IconsEnumeratorStore(this.icons);
  handleOnChange: (() => void) | null = null;  

  @observable id = '';
  @observable name = '';
  @observable description = '';

  @observable _busy = false;
  @observable.ref private _root: IconStore | null = null;
  @observable mode: TSchemeMode = 'view';
  @observable state: TSchemeState = 'start';
  @observable defaultIconBackgroundColor = '#ffffff';
  @observable editorBackgroundColor = '#c0e0e8';

  constructor(
    readonly frontRoot: FrontRootStore,
    readonly infrastructure: TInfrastructureType,
    readonly documentType: string,
    readonly projectPath: string,
    public documentPath: string,
    readonly projectStore: ProjectStore | null,
  ) {
    makeObservable(this);
  }

  get loaded(): boolean {
    return !!this._root;
  }

  @action setRoot(root: IconStore) {
    this._root = root;
    root.position.setPosition({
      x: 0,
      y: 0,
    });
  }

  @action resetPosition() {
    if (!this._root) return;
    this.viewPosition.setPosition((this._root.shape.leftSize ?? 0) + CELL_SIZE, CELL_SIZE);
  }

  get busy(): boolean {
    return !this.loaded || this._busy;
  }

  get isEditing(): boolean {
    return this.mode === 'edit';
  }

  get root(): IconStore {
    if (!this._root) {
      throw new Error('Root not exists');
    }
    return this._root;
  }

  onChange(historyItem: IHistoryStoreItem): void {
    if (historyItem) {
      this.history.add(historyItem)
    }
    if (this.handleOnChange) {
      this.handleOnChange();
    }
  }

  getDomRect(): IDomRect {
    return this.frontRoot.getDomRectById(this.id);
  }

  createIconFromDto<T extends IconStore = IconStore>(dto: IconDto, parentId: string | null): T {
    const alias = dto.alias;
    const iconConfig = this.infrastructure.config.icons[alias];
    if (!iconConfig) {
      //console.log('dto', dto);
      throw new Error(`Icon not found by alias: ${dto.alias}`);
    }
    const icon = iconConfig.transformer.fromDto(this, dto) as T;
    icon.setParentId(parentId);
    return icon;
  }

  iconToDto(icon: IconStore): IconDto {
    return icon.transformer.toDto(icon);
  }

  getRenderer(icon: IconStore): TIconRenderer {
    return icon.getRenderer();
    /*if(icon.alias === 'system') {
      if(icon instanceof SwitchOptionStore) {
        return SwitchOptionComponent as TIconRenderer;
      }
      if(icon instanceof SimpleIconWithSkewerStore) {
        return SimpleIconWithSkewerComponent as TIconRenderer;
      }
      if(icon instanceof ParallelThreadIconStore) {
        return ParallelThreadIconComponent as TIconRenderer;
      }
    }
    if(icon.alias.startsWith('system')) {
      return EmptyIconComponent;
    }
    const iconConfig = this.infrastructure.config.icons[icon.alias];
    if(!iconConfig) {
      console.error('wrong icon', icon);
      throw new Error(`Icon config not found: ${icon.alias}`);
    }
    return iconConfig.renderer as TIconRenderer;*/
  }

  dispose() {
    this.icons.dispose();
    this.valencePoints.dispose();
    this.history.clear();
    this.sheduleCallback.dispose();
    //this.mouseEvents.dispose();
  }

  @action resetState() {
    this.dnd.stopDrag();
    this.selection.dropSelection();
    this.state = 'start';
  }

  toDto(): ISchemeDto {
    return {
      id: this.id,
      schemeVersion: 2,
      name: this.name,
      type: this.documentType,
      description: this.description,
      root: this.iconToDto(this.root),
    }
  }

  @action createEmptyIcon(alias: string, parentId: string | null): IconStore {
    const iconConfig = this.infrastructure.config.icons[alias];
    if (!iconConfig) {
      throw new Error(`Icon config not found for ${alias}`);
    }
    const icon = iconConfig.transformer.create(this) as IconStore;
    return icon;
  }

  getIsIconIsInSelected(id: string): boolean {
    const icon = this.icons.getSafe(id);
    return !!icon?.isInSelected;
  }

  @computed get svgClassName(): string {
    const busy = this.busy;
    return [
      'falang-editor',
      `falang-editor-${this.mode}`,
      busy ? 'busy' : null,
    ].filter(Boolean).join(' ')
  }

  getIconListFromIcon(icon: IconStore | null): IIconList | null {
    if (checker.isThreads(icon)) {
      return icon.threads;
    }
    if (checker.isIconWithSkewer(icon)) {
      return icon.skewer;
    }
    return null;
  }

  @action setEnumeratorEnabled(enabled: boolean) {
    if(enabled && this.mode === 'edit') {
      this.mode = 'view'
    }
    this.enumeratorStore.setEnabled(enabled);
  }

  @action setMode(mode: TSchemeMode) {
    this.mode = mode;
    if(mode === 'edit') {
      this.enumeratorStore.setEnabled(false);
    }
  }

  @action insertIcons(parentId: string, index: number, data: IClipboardData | null, addToHistory = true, needResetIds = true) {
    const t = this.frontRoot.lang.t;
    if (!data) {
      this.frontRoot.toaster.show({
        message: t('app:nothing_in_clipboard'),
        intent: 'danger',
      });
      return;
    }
    if (needResetIds) {
      data.dto.forEach(iconDto => resetIds(iconDto));
    }
    const parent = this.icons.get(parentId);
    if (!checker.isIconWithList(parent)) {
      this.frontRoot.toaster.show({
        message: t('app:error'),
        intent: 'danger',
      });
      return;
    }
    if (checker.isThreads(parent)) {
      if (data.listType !== 'threads') {
        this.frontRoot.toaster.show({
          message: t('app:cant_insert_here'),
          intent: 'danger',
        });
        return;
      }
      if (parent.id !== data.parentId) {
        this.frontRoot.toaster.show({
          message: t('app:cant_insert_here'),
          intent: 'danger',
        });
        return;
      }
    } else if (data.listType !== 'skewer') {
      this.frontRoot.toaster.show({
        message: t('app:cant_insert_here'),
        intent: 'danger',
      });
      return;
    }
    let icons: any[] = [];
    if (checker.isThreads(parent)) {
      data.dto.forEach((dto) => icons.push(parent.createChildFromDto(dto)));
    } else {
      data.dto.forEach((dto) => icons.push(this.createIconFromDto(dto, parent.id)))
    };
    const ids = data.dto.map(icon => icon.id);
    parent.list.splice(index, 0, icons);
    if (addToHistory) {
      this.onChange({
        back: () => {
          const parent = this.icons.get(parentId);
          if (!checker.isIconWithList(parent)) return;
          ids.forEach(id => {
            const icon = this.icons.get(id);
            parent.list.removeIcon(this.icons.get(id));
            icon.dispose();
          });
        },
        forward: () => {
          this.insertIcons(parentId, index, data, false, false);
        }
      });
    };
  }

  async insertIconsFromClipboard(parentId: string, index: number) {
    this.insertIcons(parentId, index, await this.getDataFromClipboard())
  }

  async hasIconInClipboard(): Promise<boolean> {
    return (await this.getDataFromClipboard()) !== null;
  }

  private async getDataFromClipboard(): Promise<IClipboardData | null> {
    const t = this.frontRoot.lang.t;
    const clipboardText = await this.frontRoot.clipboard.getValue();
    if (!clipboardText || !clipboardText.startsWith('{')) {
      return null;
    }
    let data: IClipboardData | null = null;

    try {
      data = JSON.parse(clipboardText);
    } catch (err) { }
    if (!isClipboardData(data)) {
      return null;
    }
    return data;
  }

  copyIconsToClipboard() {
    const selectedIds = this.selection.selectedIconsIds;
    const parent = this.selection.firstSelectedIcon?.parent;
    if (!parent || !checker.isIconWithList(parent)) return;
    if (!selectedIds.length) return;
    const indexes: Record<string, number> = {};
    selectedIds.forEach((id) => {
      const index = parent.list.iconsIds.indexOf(id);
      indexes[id] = index;
    });
    const sortedIds = selectedIds.slice().sort((a, b) => indexes[a] - indexes[b]);
    const dto = sortedIds.map((iconId) => {
      const icon = this.icons.get(iconId);
      return this.iconToDto(icon);
    });
    const data: IClipboardData = {
      dto,
      listType: checker.isThreads(parent) ? 'threads' : 'skewer',
      parentId: parent.id,
      type: 'falang-clipboard',
      infrastructure: this.infrastructure.config.name,
    };
    this.frontRoot.clipboard.setValue(JSON.stringify(data));
  }
}

interface IClipboardData {
  type: 'falang-clipboard'
  listType: 'skewer' | 'threads'
  parentId: string
  infrastructure: string
  dto: IconDto[]
}

const isClipboardData = (data: any): data is IClipboardData => {
  if (typeof data !== 'object') return false;
  return data.type === 'falang-clipboard';
}

const resetIds = (data: any) => {
  if (Array.isArray(data)) {
    data.forEach((item) => resetIds(item));
    return;
  }
  if (typeof data !== 'object') return;
  for (const key in data) {
    if (typeof data[key] === 'object') {
      resetIds(data[key]);
    }
    if (typeof data[key] === 'string' && key === 'id') {
      data[key] = nanoid();
    }
  }
}