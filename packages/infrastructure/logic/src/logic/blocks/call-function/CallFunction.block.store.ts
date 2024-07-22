import { computed, makeObservable, observable, runInAction } from 'mobx';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { getCodeWidth } from '@falang/infrastructure-code';
import { TextStore } from '@falang/infrastructure-text';
import { getTextWidth } from '@falang/editor-scheme';
import { TContext } from '../../constants';
import { ExpressionStore } from '../../expression/Expression.store';
import { validateName } from '../../util/validateName';
import { validateNode } from '../../util/validateNode';
import { LogicBaseBlockStore } from '../logic-base/LogicBaseBlock.store';
import { CallFunctionBlockDto } from './CallFunction.block.dto';
import { TCallFunctionBlockType } from './TCallFunctionBlockType';

export interface ICallFunctionBlockStoreParams extends CallFunctionBlockDto, IBlockStoreParams {
  type: TCallFunctionBlockType
}

export class CallFunctionBlockStore extends LogicBaseBlockStore {
  readonly parametersExpressions = observable<ExpressionStore>([]);
  readonly type: TCallFunctionBlockType = 'internal';
  readonly returnExpression: TextStore;
  readonly functionSchemeId: string;
  readonly iconId: string | null;

  constructor(params: ICallFunctionBlockStoreParams) {
    super(params);
    this.functionSchemeId = params.schemeId;
    this.returnExpression = new TextStore({
      text: params.returnVariable,
      minHeight: CELL_SIZE,
      singleLine: true,
    });
    this.iconId = params.iconId ?? null;
    makeObservable(this);
    const newParameters: ExpressionStore[] = [];
    params.parameters.forEach((value) => {
      const expr = new ExpressionStore({
        expression: value,
        scheme: params.scheme,
        minHeight: CELL_SIZE,
      });
      expr.code.width = () => this.width - this.maxParameterWidth;
      newParameters.push(expr);
    });
    if(params.type) {
      this.type = params.type;
    }
    runInAction(() => {
      this.parametersExpressions.replace(newParameters);
    });
  }

  protected initShape(): void {
    super.initShape();
    this.returnExpression.width = () => this.width - this.maxParameterWidth;
    this.parametersExpressions.forEach((p) => {
      p.code.width = () => this.width - this.maxParameterWidth;
    });
  }

  @computed get currentFunctionData() {
    if(this.type === 'internal') {
      return this.projectStore.getFunctionDataById(this.functionSchemeId);
    } else if (this.iconId) {
      return this.projectStore.getApiDataById(this.functionSchemeId, this.iconId);
    }
    return null;    
  }

  @computed get functionHaveReturn() {
    return this.currentFunctionData?.returnValue.type !== 'void';
  }

  @computed get parametersCount() {
    return this.currentFunctionData?.parameters.length ?? 0;
  }

  @computed get parametersHeight(): number {
    return this.parametersExpressions.reduce<number>((curr, next) => {
      //console.log('nextHeight', next.height);
      return curr + next.height;
    }, 0);
  }

  getHeight() {    
    return CELL_SIZE + this.parametersHeight + (this.functionHaveReturn ? CELL_SIZE : 0);
  }

  protected getExportedVariables(): TContext {
    const returnValue = super.getExportedVariables();
    if(this.functionHaveReturn && this.currentFunctionData) {
      returnValue[this.returnExpression.text] = this.projectStore.getFilledType(this.currentFunctionData.returnValue);
    }
    return returnValue;
  }

  protected getErrors(): string[] {
    const returnValue = super.getErrors();
    if(this.currentFunctionData) {
      const context = this.context;
      if(this.currentFunctionData.parameters.length) {        
        this.currentFunctionData.parameters.forEach((param, index) => {
          const node = this.parametersExpressions[index]?.mathNode ?? null;
          if(!node) {
            returnValue.push(`_{logic:wrong_parameter}: ${param.name}`);
            return;
          }
          try {
            validateNode({ node: node, context, typeInfo: param.type, projectStore: this.projectStore });
          } catch (err) {
            returnValue.push(err instanceof Error ? err.message : `_{logic:wrong_parameter}: ${param.name}`);
          }
        });
      }
      if(this.currentFunctionData.returnValue.type !== 'void') {
        const returnName = this.returnExpression.text;
        if (!validateName(returnName)) {
          returnValue.push(`_{logic:wrong_name}: ${returnName}`);
        } else if(returnName in context) {
          returnValue.push(`_{logic:variable_already_exists}: ${returnName}`);
        }
      }
    } else {
      returnValue.push('_{logic:function_not_found}');
    }
    return returnValue;
  }

  public beforeEdit(): void {
    super.beforeEdit();
    const funcData = this.currentFunctionData;
    if(!funcData) {
      const t = this.scheme.frontRoot.lang.t;
      this.scheme.frontRoot.toaster.show({
        message: `${t('logic:function_not_found')}: ${this.functionSchemeId}`,
        intent: 'danger'
      });
    } else if(funcData.parameters.length > this.parametersExpressions.length) {
      for(let i = this.parametersExpressions.length; i <= funcData.parameters.length; i++) {        
        const expr = new ExpressionStore({
          expression: '',
          scheme: this.scheme,
          minHeight: CELL_SIZE,
        });
        expr.code.width = () => this.width - this.maxParameterWidth;
        this.parametersExpressions.push(expr);
      }
    } else if(funcData.parameters.length < this.parametersExpressions.length) {
      this.parametersExpressions.splice(funcData.parameters.length);
    }
  }

  @computed get needLineAfterName() {
    return this.functionHaveReturn || this.parametersCount > 0;
  }

  @computed get maxParameterWidth(): number {
    const returnValue = Math.max(
      CELL_SIZE * 4,
      ...this.currentFunctionData?.parameters.map((p) => getCodeWidth(p.name) + 8) ?? []
    );
    return Math.ceil(returnValue / CELL_SIZE) * CELL_SIZE;
  }

}