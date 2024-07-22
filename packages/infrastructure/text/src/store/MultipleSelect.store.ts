import { action, computed, makeObservable, observable } from 'mobx';
import { FC } from 'react';
import { EmptyComponent } from '@falang/editor-scheme';
import { CELL_SIZE, CELL_SIZE_2 } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { PositionStore } from '@falang/editor-scheme';
import { ShapeStore } from '@falang/editor-scheme';
import { IWithErorrs } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { MultipleSelectStoreEditorComponent } from '../cmp/MultipleSelectStore.editor.cmp';
import { MultipleSelectStoreViewComponent } from '../cmp/MultipleSelectStore.view.cmp';
import { SelectStore } from './Select.store';
import { ISelectOption } from '@falang/editor-scheme';

export interface IMultipleSelectStoreParams {
  scheme: SchemeStore
  getOptions: () => ISelectOption[]
  selectedValues?: string[]
  minHeight?: number
}

export class MultipleSelectStore implements IBlockInBlock<MultipleSelectStore>, IWithErorrs {
  readonly scheme: SchemeStore;
  private readonly getOptions: () => ISelectOption[]
  @observable selects = observable<SelectStore>([]);
  readonly position = new PositionStore();
  readonly shape = new ShapeStore();
  readonly minHeight: number;

  constructor(params: IMultipleSelectStoreParams) {
    this.scheme = params.scheme;
    this.getOptions = params.getOptions;
    this.minHeight = params.minHeight ?? CELL_SIZE_2;
    makeObservable(this);
    this.init(params);
  }

  @action private init(params: IMultipleSelectStoreParams) {
    const valuesToAdd = Math.max(params.selectedValues?.length ?? 0, 1);
    for (let i = 0; i < valuesToAdd; i++) {
      const selectStore = new SelectStore({
        scheme: this.scheme,
        getOptions: params.getOptions,
        selectedValue: (params.selectedValues && params.selectedValues[i]) ? params.selectedValues[i] : null,
      })
      this.selects.push(selectStore);
      selectStore.shape.setWidth(() => this.shape.width);
    }
    this.shape.setHeight(() => Math.max(this.minHeight, this.selects.length * CELL_SIZE));
    this.updateSelectsPositions();
  }


  dispose(): void {
    this.position.dispose();
    this.shape.dispose();
    this.selects.clear();
  }
  getBackground(): FC<{ store: MultipleSelectStore; }> {
    return EmptyComponent;
  }
  getEditor(): FC<{ store: MultipleSelectStore; }> {
    return MultipleSelectStoreEditorComponent;
  }
  getRenderer(): FC<{ store: MultipleSelectStore; }> {
    return MultipleSelectStoreViewComponent;
  }

  @computed get options() {
    return this.getOptions();
  }

  @computed get selectedText(): string[] {
    return this.selects.map((select) => {
      const value = select.selectedValue;
      const selectedOption = this.options.find((o) => o.value === value);
      return selectedOption?.text ?? '';
    });
  }

  @computed get selectedValues(): string[] {
    return this.selects.map((select) => {
      const value = select.selectedValue;
      const selectedOption = this.options.find((o) => o.value === value);
      return (selectedOption?.value ?? '').toString();
    });
  }

  @action setValues(values: string[]) {

  }

  getErrors(): string[] {
    const t = this.scheme.frontRoot.lang.t;
    if (!this.selects.length) {
      return [t('logic:empty_select')];
    }
    const returnValue: string[] = [];
    this.selects.forEach((select) => {
      returnValue.push(...select.getErrors());
    });
    return returnValue;
  }

  @action addItem() {
    const selectStore = new SelectStore({
      scheme: this.scheme,
      getOptions: this.getOptions,
      selectedValue: null,
    });
    this.selects.push(selectStore);
    selectStore.shape.setWidth(() => this.shape.width);
    this.updateSelectsPositions();
  }

  @action removeItem(index: number) {
    if (index < 0 || index > this.selects.length - 1 || this.selects.length === 1) return;
    const items = this.selects.spliceWithArray(index, 1);
    items.forEach((item) => {
      item.dispose();
    });
    this.updateSelectsPositions();
  }

  private updateSelectsPositions() {
    this.selects.forEach((select, index) => {
      select.position.setPosition({
        x: () => this.position.x,
        y: () => this.position.y + index * CELL_SIZE,
      })
    });
  }
}