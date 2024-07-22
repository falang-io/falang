import { BlockTransformer } from '@falang/editor-scheme';
import { EmptyBlockComponent } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { IAvailableFunctionItem } from '../../util/loadAvailableFunctions';
import { CallFunctionBlockComponent } from './CallFunction.block.cmp';
import { CallFunctionBlockDto } from './CallFunction.block.dto';
import { CallFunctionBlockEditorComponent } from './CallFunction.block.editor.cmp';
import { CallFunctionBlockStore } from './CallFunction.block.store';
import { CallFunctionBgBlockComponent } from './CallFunctionBg.block.cmp';
import { TCallFunctionBlockType } from './TCallFunctionBlockType';

export interface ICallFunctionBlockTransformerParams {
  type: TCallFunctionBlockType,
}

export class CallFunctionBlockTransformer extends BlockTransformer<CallFunctionBlockDto, CallFunctionBlockStore> {

  className = 'CallFunctionBlockTransformer';
  type: TCallFunctionBlockType;

  constructor(params: ICallFunctionBlockTransformerParams) {
    super({
      dtoConstructor: CallFunctionBlockDto,
      viewConfig: {
        bg: CallFunctionBgBlockComponent,
        editor: CallFunctionBlockEditorComponent,
        renderer: CallFunctionBlockComponent,
      }
    });
    this.type = params.type;
  }

  create(scheme: SchemeStore, id: string): CallFunctionBlockStore {
    throw new Error('Cant create from scratch');
    /*return new CallFunctionBlockStore({
      id,
      scheme,
      parameters: [],
      returnVariable: '',
      schemeId: '',
      transformer: this,
      width: 0,
    });*/
  }

  createFromFunctionData(scheme: SchemeStore, id: string, functionData: IAvailableFunctionItem) {
    //console.log('funcionData', functionData);
    return new CallFunctionBlockStore({
      id,
      scheme,
      parameters: functionData.parameters.map(() => ''),
      returnVariable: '',
      schemeId: functionData.schemeId,
      transformer: this,
      width: CELL_SIZE * 10,
      type: this.type,
      iconId: functionData.iconId ?? null,
    })
  }
  fromDto(scheme: SchemeStore, dto: CallFunctionBlockDto, id: string): CallFunctionBlockStore {
    return new CallFunctionBlockStore({
      ...dto,
      id,
      scheme,
      transformer: this,
      type: this.type,
    })
  }
  isChanged(store: CallFunctionBlockStore, dto: CallFunctionBlockDto): boolean {
    if(dto.parameters.length !== store.parametersExpressions.length) return false;
    for(let i = 0; i < dto.parameters.length; i++) {
      if(dto.parameters[i] !== store.parametersExpressions[i].code.code) return false;
    }
    if(dto.returnVariable !== store.returnExpression.text) return false;
    if(dto.width !== store.width) return false;
    return true;
  }
  toDto(store: CallFunctionBlockStore): CallFunctionBlockDto {
    return {
      parameters: store.parametersExpressions.map((p) => p.expression),
      returnVariable: store.returnExpression.text,
      schemeId: store.functionSchemeId,
      width: store.width,
      iconId: store.iconId,
    }
  }
  updateFromDto(store: CallFunctionBlockStore, dto: CallFunctionBlockDto): void {
    store.parametersExpressions.forEach((p, i) => {
      p.code.setCode(dto.parameters[i] ?? '');
    });
    store.returnExpression.setText(dto.returnVariable);
    store.width = dto.width;
  }
}