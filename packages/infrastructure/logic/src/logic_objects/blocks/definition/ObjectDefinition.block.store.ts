import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import * as math from 'mathjs';
import { LogicBaseBlockStore } from '../../../logic/blocks/logic-base/LogicBaseBlock.store';
import { ObjectDefinitionBlockDto } from './ObjectDefinition.block.dto';
import { IBlockWithVariableType } from '../../../logic/util/IBlockWithVariableType';
import { TVariableInfo } from '../../../logic/constants';
import { ExpressionStore } from '../../../logic/expression/Expression.store';
import { variableNameRegexp } from '../../../logic/util/variableNameRegexp';


interface IObjectDefinitionBlockStoreParams extends IBlockStoreParams, ObjectDefinitionBlockDto {
}

export class ObjectDefinitionBlockStore extends LogicBaseBlockStore implements IBlockWithVariableType {
  readonly expressionStore: ExpressionStore;
  @observable.ref private _variableType: TVariableInfo | null;  

  constructor(params: IObjectDefinitionBlockStoreParams) {
    super({
      ...params,
    });
    this._variableType = params.variableType;
    this.expressionStore = new ExpressionStore({
      expression: params.name,
      scheme: params.scheme,
    });
    makeObservable(this);
    runInAction(() => {
      this.expressionStore.code.width = () => this.width;
    });
  }

  get name() {
    return this.expressionStore.expression;
  }

  get variableType() {
    return this._variableType;
  }

  @action setName(ObjectDefinition: string) {
    this.expressionStore.code.setCode(ObjectDefinition)
  }

  @action setVariableType(type: TVariableInfo | null) {
    this._variableType = type;
  }

  getExportedVariables(): Record<string, TVariableInfo> {
    const returnValue: Record<string, TVariableInfo> = super.getExportedVariables();
    if (this._variableType && this.variableName) {
      returnValue[this.variableName] = this._variableType;
    }
    return returnValue;
  }

  @computed get variableName(): string | null {
    const node = this.expressionStore.mathNode;
    if (!math.isAssignmentNode(node)) {
      return null;
    }
    return node.object.name;
  }

  protected getHeight(): number {
    return this.expressionStore.height + this.extraHeight;
  }

  protected getErrors(): string[] {
    const t = this.scheme.frontRoot.lang.t;
    if(!variableNameRegexp.test(this.name)) {
      return [t('logic:wrong_var_name')];
    }
    return [];
  }

  @computed get extraHeight(): number {
    return this.variableType?.type === 'array' ? CELL_SIZE * 2 : CELL_SIZE;
  }

  dispose(): void {
    this.expressionStore.dispose();
    super.dispose();
  }
}