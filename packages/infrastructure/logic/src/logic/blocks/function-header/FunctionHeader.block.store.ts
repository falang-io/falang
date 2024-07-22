import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { EmptyBlockTransformer } from '@falang/editor-scheme';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE, CELL_SIZE_2, CELL_SIZE_3, CELL_SIZE_4 } from '@falang/editor-scheme';
import { IBlockBadge } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { IBlockLine } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { PositionStore } from '@falang/editor-scheme';
import { ShapeStore } from '@falang/editor-scheme';
import { TComputedProperty } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { Text2Store } from '@falang/infrastructure-text';
import { getTextWidth } from '@falang/editor-scheme';
import { TContext, TVariableInfo } from '../../constants';
import { LogicProjectStore } from '../../LogicProject.store';
import { getCenteredBadge } from '../../util/getCenteredBadge';
import { getInlineTypeHeight } from '../../util/getInlineTypeHeight';
import { validateName } from '../../util/validateName';
import { LogicBaseBlockStore } from '../logic-base/LogicBaseBlock.store';
import { FunctionHeaderBlockDto, FunctionHeaderParameterDto } from './FunctionHeader.block.dto';
import { InlineTypeStore } from '../../store/InlineType.store';

interface IFunctionHeaderBlockStoreParams extends IBlockStoreParams, FunctionHeaderBlockDto {
  overrideName?: () => string
}

interface IFunctionHeaderParameterBlockStoreParams extends FunctionHeaderParameterDto {
  scheme: SchemeStore;
  projectStore: LogicProjectStore
}

export class ParameterStore {
  readonly nameStore: Text2Store;
  readonly typeStore: InlineTypeStore;
  readonly position = new PositionStore();
  readonly shape = new ShapeStore();
  @observable private _parameterWidth: TComputedProperty<number> = 0;

  constructor(params: IFunctionHeaderParameterBlockStoreParams) {
    this.nameStore = new Text2Store({
      text: params.name,
      singleLine: true,
      scheme: params.scheme,
      singleLineAlign: 'left',
      minHeight: CELL_SIZE,
    });
    this.typeStore = new InlineTypeStore({
      scheme: params.scheme,
      type: params.type,
      projectStore: params.projectStore,
    });
    this.nameStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.typeStore.position.setPosition({
      x: () => this.position.x + this.parameterWidth,
      y: () => this.position.y,
    });
    this.typeStore.shape.setWidth(() => this.shape.width - this.parameterWidth);
    this.nameStore.shape.setWidth(() => this.parameterWidth);
    this.shape.setHeight(() => this.typeStore.shape.height);
    makeObservable(this);
  }

  get parameterWidth() {
    return getComputedValue(this._parameterWidth, 0);
  }
  setParameterWidth(width: TComputedProperty<number>) {
    this._parameterWidth = width;
  }

  get variableType() {
    return this.typeStore.get();
  }

  @action setVariableType(type: TVariableInfo) {
    this.typeStore.set(type);
  }

  dispose() {
    this.nameStore.dispose();
    this.position.dispose();
    this.typeStore.dispose();
    this.shape.dispose();
  }

}

export class FunctionHeaderBlockStore extends LogicBaseBlockStore {
  readonly parameters = observable<ParameterStore>([]);
  readonly returnStore: InlineTypeStore;
  readonly nameStore: Text2Store;

  constructor(params: IFunctionHeaderBlockStoreParams) {
    //console.log('params', params);
    super(params);
    const parameters: ParameterStore[] = [];
    params.parameters.forEach((p) => {
      const ps = new ParameterStore({
        ...p,
        scheme: this.scheme,
        projectStore: this.projectStore
      })
      ps.shape.setWidth(() => this.width);
      ps.setParameterWidth(() => this.maxParameterWidth);
      parameters.push(ps);
    });
    this.returnStore = new InlineTypeStore({
      scheme: this.scheme,
      type: params.returnValue,
      allowVoid: true,
      projectStore: this.projectStore,
    });
    this.nameStore = new Text2Store({
      scheme: this.scheme,
      computedText: params.overrideName,
      singleLine: true,
      text: params.name,
    });
    this.parameters.replace(parameters);
    makeObservable(this);
  }

  @action addParameter() {
    const ps = new ParameterStore({
      name: '',
      type: {
        type: 'number',
        numberType: 'integer',
        integerType: 'int32',
      },
      scheme: this.scheme,
      projectStore: this.projectStore,
    });
    ps.shape.setWidth(() => this.width);
    ps.setParameterWidth(() => this.maxParameterWidth);
    this.parameters.push(ps);
    this.updateParametersShape();
  }

  getBlocksInBlock(): IBlockInBlock<any>[] {
    return [
      this.nameStore,
      ...this.parameters.map((p) => [p.nameStore, p.typeStore]).flat(),
      this.returnStore,
    ];
  }

  getBlockLines(): IBlockLine[] | null {
    const w = this.shape.width;
    const ph = this.parametersHeight;
    const nw = this.namesWidth;
    const maxParameterWidth = this.maxParameterWidth;
    let dy = CELL_SIZE * 3;
    const returnValue: IBlockLine[] = [
      {
        dx1: 0,
        dx2: w,
        dy1: CELL_SIZE_2,
        dy2: CELL_SIZE_2
      },
      ...this.parameters.map((p) => {
        const currentDy = dy;
        dy += p.shape.height;
        return {
          dx1: 0,
          dx2: nw,
          dy1: currentDy,
          dy2: currentDy,
        };
      }),
      {
        dx1: 0,
        dx2: w,
        dy1: CELL_SIZE_3 + ph,
        dy2: CELL_SIZE_3 + ph,
      },
      {
        dx1: nw,
        dx2: nw,
        dy1: CELL_SIZE_3,
        dy2: CELL_SIZE_3 + ph,
      },
      {
        dx1: nw,
        dx2: nw,
        dy1: CELL_SIZE_3 + ph,
        dy2: CELL_SIZE_3 + ph + this.returnStore.shape.height,
      }
    ];
    if (this.iNeedBottomLine) {
      returnValue.push({
        dx1: maxParameterWidth,
        dx2: nw,
        dy1: CELL_SIZE * 3 + ph,
        dy2: CELL_SIZE * 3 + ph,
      })
    }

    return returnValue;
  }

  getBlockBadges(): IBlockBadge[] {
    const t = this.scheme.frontRoot.lang.t;
    const ph = this.parametersHeight;
    const returnValue: IBlockBadge[] = [
      {
        dx: 0,
        dy: CELL_SIZE_2,
        text: t('logic:func_parameters'),
      },
      {
        dx: 0,
        dy: CELL_SIZE_3 + ph,
        text: t('logic:return_type'),
      },
    ]
    if (!this.parameters.length) {
      returnValue.push({
        dx: CELL_SIZE * 6,
        dy: CELL_SIZE_2,
        text: t('logic:void'),
      })
    }
    return returnValue;
  }

  @action removeParameter(index: number) {
    if (!confirm(this.scheme.frontRoot.lang.t('logic:remove_parameter'))) return;
    const returned = this.parameters.spliceWithArray(index, 1);
    returned.forEach((p) => p.dispose());
    this.updateParametersShape();
  }

  protected getErrors(): string[] {
    const returnValue = super.getErrors();
    returnValue.push(...this.validateFunctionHeader());
    return returnValue;
  }

  private validateFunctionHeader(): string[] {
    const returnValue: string[] = [];
    this.parameters.forEach((p) => {
      if (!validateName(p.nameStore.text)) {
        returnValue.push(`_{logic:wrong_name}: ${p.nameStore.text}`);
      }
    });
    if (!returnValue.length) {
      const allNames = this.parameters.map((p) => p.nameStore.text);
      for (let i = 0; i < allNames.length; i++) {
        if (allNames.indexOf(allNames[i], i + 1) !== -1) {
          returnValue.push(`_{logic:duplicate_name}: ${allNames[i]}`);
        }
      }
    }
    return returnValue;
  }

  @computed get parametersHeight(): number {
    return this.parameters.reduce<number>((prev, current) => {
      return getInlineTypeHeight(current.variableType) + prev;
    }, 0);
  }

  protected getHeight(): number {
    let returnValue = CELL_SIZE * 3;
    if (this.parameters.length || this.isMeUnderEdit) {
      this.parameters.forEach((p) => {
        returnValue += getInlineTypeHeight(p.variableType);
      });
    }
    returnValue += getInlineTypeHeight(this.returnStore.get());
    return returnValue;
  }

  @computed get iNeedBottomLine() {
    return getInlineTypeHeight(this.returnStore.get()) > CELL_SIZE;
  }

  @computed get namesWidth(): number {
    return this.maxParameterWidth;
  }

  protected getScopeVariables(): TContext {
    const returnValue = super.getScopeVariables();
    this.parameters.forEach((p) => {
      returnValue[p.nameStore.text] = this.projectStore.getFilledType(p.variableType);
    });
    if (this.returnStore.get().type !== 'void') {
      returnValue['returnValue'] = this.projectStore.getFilledType(this.returnStore.get());
    }
    return returnValue;
  }

  @computed get functionHeaderTextWidth() {
    return getTextWidth(this.scheme.name)
  }

  @computed get maxParameterWidth(): number {
    const returnValue = Math.max(
      CELL_SIZE * 4,
      ...this.parameters.map((p) => getTextWidth(p.nameStore.text) + 8)
    );
    return Math.ceil(returnValue / CELL_SIZE) * CELL_SIZE;
  }

  protected initShape(): void {
    super.initShape();
    //console.log(this);
    this.returnStore.position.setPosition({
      x: () => this.position.x + this.maxParameterWidth,
      y: () => this.position.y + this.parametersHeight + CELL_SIZE * 3
    });
    this.returnStore.shape.setWidth(() => Math.max(0, this.width - this.maxParameterWidth));
    this.nameStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.nameStore.shape.setWidth(() => this.shape.width);
    this.parameters.forEach((p) => p.setParameterWidth(() => this.maxParameterWidth));
    this.updateParametersShape();
  }

  private updateParametersShape(): void {
    let prevStore: ParameterStore | null = null;
    this.parameters.forEach((p) => {
      ((prev: ParameterStore | null) => {
        p.position.setPosition({
          x: () => this.position.x,
          y: () => {
            return prev ? (prev.position.y + prev.shape.height) : this.position.y + CELL_SIZE * 3;
          },
        })
      })(prevStore);
      prevStore = p;
    });
  }

  dispose(): void {
    super.dispose();
    this.returnStore.dispose();
    this.parameters.forEach((p) => p.dispose());
    this.parameters.clear();
    this.nameStore.dispose();
  }

}
