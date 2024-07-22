import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SelectComponent } from '@falang/editor-scheme';
import { SelectOptionTypes, TSelectOptionType, TVariableInfo } from '../constants';
import { IVariableTypeEditorComponentParams } from '../util/IVariableTypeEditorComponentParams';

export interface IGeneralTypeSelectComponentParams extends IVariableTypeEditorComponentParams {
  enabledOptionTypes?: TSelectOptionType[]
}

export const GeneralTypeSelectComponent: React.FC<IGeneralTypeSelectComponentParams> = observer(({ scheme, projectStore, x, y, width, setVariableType, variableType, enabledOptionTypes, allowVoid }) => {
  let optionTypes = enabledOptionTypes ?? SelectOptionTypes;
  const vType = variableType;
  const t = scheme.frontRoot.lang.t;
  const firstStruct = projectStore.availableStructures.length ? projectStore.availableStructures[0] : null;
  if (!vType) return null;
  return <SelectComponent
    height={CELL_SIZE}
    x={x}
    y={y}
    width={width}
    onChange={(value) => {
      let newVType: TVariableInfo | null = null;
      switch (value as TSelectOptionType) {
        case 'decimal':
          newVType = {
            type: 'number',
            numberType: 'decimal',
            constant: vType.constant,
            digits: 10,
            decimals: 2,
            optional: vType.optional,
          };
          break;
        case 'float':
          newVType = {
            type: 'number',
            numberType: 'float',
            floatType: 'float32',
            constant: vType.constant,
            optional: vType.optional,
          };
          break;
        case 'integer':
          newVType = {
            type: 'number',
            numberType: 'integer',
            integerType: 'int32',
            constant: vType.constant,
            optional: vType.optional,
          };
          break;
        case 'boolean':
          newVType = {
            type: 'boolean',
            constant: vType.constant,
            optional: vType.optional,
          };
          break;
        case 'string':
          newVType = {
            type: 'string',
            constant: vType.constant,
            optional: vType.optional,
          };
          break;
        case 'array':
          newVType = {
            type: 'array',
            elementType: {
              type: 'number',
              numberType: 'integer',
              integerType: 'int32',
            },
            constant: vType.constant,
            optional: vType.optional,
            dimensions: 1,
          }
          break;
        case 'struct':
          newVType = {
            type: 'struct',
            constant: vType.constant,
            optional: vType.optional,
            iconId: firstStruct?.iconId ?? '',
            schemeId: firstStruct?.schemeId ?? '',
            name: firstStruct?.name ?? '',
          }
          break;
        case 'void':
          newVType = { type: 'void' }
          break;
        case 'enum':
          newVType = {
            type: 'enum',
            iconId: '',
            schemeId: '',
          }
      }
      if (!newVType) return;
      //console.log('new vType', newVType);
      setVariableType(newVType);
    }}
    options={optionTypes.map(type => ({
      text: t(`logic:${type}`),
      value: type,
    })).filter(t => {
      if (allowVoid) return true;
      if(t.value === 'struct' && !firstStruct) return false;
      if(t.value === 'enum') return false;
      if(t.value === 'decimal') return false;
      return t.value !== 'void';
    })}
    scheme={scheme}
    value={vType?.type === 'number' ? vType.numberType : vType.type}
  />
});
