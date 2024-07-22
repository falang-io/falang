import { action, computed, makeObservable, observable } from 'mobx';
import { SchemeStore } from './Scheme.store';
import { IconStore } from '../icons/base/Icon.store';
import { PositionStore } from '../common/store/Position.store';
import { ShapeStore } from '../common/store/Shape.store';
import { TNumberComputed } from '../common/types/TComputedProperty';
import { getComputedValue } from '../common/store/getComputedValue';
import { TIconConfig } from '../infrastructure/IInfrastructureConfig';
import { BlockDto } from '../common/blocks/Block.dto';

export class EditingStore {
  @observable private _editingIcon: IconStore | null = null;
  readonly editorPosition = new PositionStore();
  readonly editorShape = new ShapeStore();
  readonly _editorHeight: TNumberComputed = null;
  private backDto: BlockDto | null = null;

  constructor(readonly scheme: SchemeStore) {
    makeObservable(this);
    this.scheme.sheduleCallback.add(() => {
      this.initPosition();
      this.initShape();      
    });
  }

  get isIconEditing(): boolean {
    return !!this._editingIcon && this.scheme.state === 'edit-icon';
  }

  get isEditing(): boolean {
    return this.scheme.isEditing;
  }

  get editingIcon(): IconStore | null {
    return this._editingIcon;
  }

  getIconConfig(icon: IconStore): TIconConfig {
    const returnValue = this.scheme.infrastructure.config.icons[icon.alias];
    if (!returnValue) {
      throw new Error(`Config not found for alias: ${icon.alias}`);
    }
    return returnValue;
  }

  @computed get editingIconId(): string | null   {
    return this.editingIcon?.id ?? null;
  }

  @action startEdit(icon: IconStore) {
    this._editingIcon = icon;
    this.scheme.state = 'edit-icon';
    icon.block.beforeEdit();
    this.backDto = icon.block.transformer.toDto(icon.block);
    let count = 0;
    // TODO: убрать отсюда 
    const check = () => {
      const el = document.querySelector('.text-editor, .code-editor textarea')
      count++;
      if (!el) {
        if(count < 100) setTimeout(check, 1);
        return;
      }
      (el as HTMLTextAreaElement).focus();
    }
    check();
  }

  @action stopEdit() {
    if (!this.isIconEditing) return;
    const editingIcon = this._editingIcon;
    if (!editingIcon) return;
    this._editingIcon = null;
    const id = editingIcon.id;
    const forwardDto = editingIcon.block.transformer.toDto(editingIcon.block);
    const backDto = this.backDto;
    const transformer = editingIcon.block.transformer;
    if (!backDto) return;
    if (transformer.isChanged(editingIcon.block, backDto)) {
      this.scheme.onChange({
        back: () => {
          const icon = this.scheme.icons.getSafe(id);
          if (!icon) return;
          transformer.updateFromDto(icon.block, backDto);
        },
        forward: () => {
          const icon = this.scheme.icons.getSafe(id);
          if (!icon) return;
          transformer.updateFromDto(icon.block, forwardDto);
        }
      });
    }

    this.scheme.resetState();
    this.scheme.state = 'start';
  }

  @action private initPosition() {
    this.editorPosition.setPosition({
      x: () => this.editingIcon?.block.position.x ?? 0,
      y: () => this.editingIcon?.block.position.y ?? 0,
    });
  }

  @action onCtrlEnter() {
    this.stopEdit();
  }

  @action private initShape() {
    this.editorShape.setSize({
      leftSize: () => this.editingIcon?.block.shape.leftSize ?? 0,
      rightSize: () => this.editingIcon?.block.shape.rightSize ?? 0,
      height: () => getComputedValue(this._editorHeight, 0),
    })
  }
}