import { computed, makeObservable, observable } from 'mobx';
import { FC } from 'react';
import { EmptyComponent } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { PositionStore } from '@falang/editor-scheme';
import { ShapeStore } from '@falang/editor-scheme';
import { IWithErorrs } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { SelectStoreEditorComponent } from '../cmp/SelectStore.editor.cmp';
import { SelectStoreViewComponent } from '../cmp/SelectStore.view.cmp';
import { ISelectOption } from './ISelectOption';

export interface ISelectStoreParams {
  scheme: SchemeStore
  getOptions: () => ISelectOption[]
  selectedValue?: string | null
}

export class SelectStore implements IBlockInBlock<SelectStore>, IWithErorrs {
  readonly scheme: SchemeStore;
  @observable selectedValue: string | number | null = null;
  private readonly getOptions: () => ISelectOption[];
  readonly position = new PositionStore();
  readonly shape = new ShapeStore();

  constructor(params: ISelectStoreParams) {
    this.scheme = params.scheme;
    this.getOptions = params.getOptions;
    if(params.selectedValue) {
      this.selectedValue = params.selectedValue;
    } else {
      const options = params.getOptions();
      this.selectedValue = options.length ? options[0].value : null;  
    }
    
    makeObservable(this);
    this.shape.setHeight(CELL_SIZE);
  }

  @computed get options(): ISelectOption[] {
    return this.getOptions();
  }


  dispose(): void {
    this.position.dispose();
    this.shape.dispose();
    this.selectedValue = null;
  }
  getBackground(): FC<{ store: SelectStore; }> {
    return EmptyComponent;
  }
  getEditor(): FC<{ store: SelectStore; }> {
    return SelectStoreEditorComponent;
  }
  getRenderer(): FC<{ store: SelectStore; }> {
    return SelectStoreViewComponent;
  }

  setValue(value: string) {
    this.selectedValue = value;
  }

  @computed get selectedText(): string {
    const selectedOption = this.options.find((o) => o.value === this.selectedValue);
    /*console.log('qwe', {
      selectedOption,
      val: this.selectedValue,
      options: this.options.slice()
    });*/
    if (!selectedOption) return '';
    return selectedOption.text;
  }

  getErrors(): string[] {
    const selectedValue = this.selectedValue;
    const selectedOption = this.options.find((o) => o.value === this.selectedValue);
    if (!selectedOption) {
      const t = this.scheme.frontRoot.lang.t;
      return [`${t('logic:wrong_value')}: ${selectedValue}`];
    }
    return [];
  }
}