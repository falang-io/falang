import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { NumberComponent } from '@falang/editor-scheme';
import { SelectComponent } from '@falang/editor-scheme';
import { FloatTypes, IntegerTypes, TFloatType, TIntegerType } from '../constants';
import { getInEditorBlockStyle } from '@falang/editor-scheme';
import { getInEditorLineStyle } from '../util/getInEditorLineStyle';
import { IBlockWithVariableTypeComponentParams } from '../util/IBlockWithVariableType';
import { IVariableTypeEditorComponentParams } from '../util/IVariableTypeEditorComponentParams';

export const FloatIntegerOptionsComponent: React.FC<IVariableTypeEditorComponentParams> = observer(({ scheme, setVariableType, variableType, x, y, width }) => {
  const vType = variableType;
  const t = scheme.frontRoot.lang.t;
  if (!vType) return null;
  if (vType.type !== 'number' || vType.numberType === 'decimal' || vType.numberType === 'any') {
    return null;
  }
  return <SelectComponent
    height={CELL_SIZE}
    x={x}
    y={y}
    width={width}
    onChange={(value) => {
      if (vType.numberType === 'float') {
        setVariableType({
          ...vType,
          floatType: value as TFloatType,
        });
      } else {
        setVariableType({
          ...vType,
          integerType: value as TIntegerType,
        });
      }
    }}
    options={vType.numberType === 'float' ? FloatTypes.map(type => ({
      text: t(`logic:${type}`),
      value: type,
    })) : IntegerTypes.map(type => ({
      text: t(`logic:${type}`),
      value: type,
    }))}
    scheme={scheme}
    value={vType.numberType === 'float' ? vType.floatType : vType.integerType}
  />;
});
