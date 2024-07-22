import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SelectComponent } from '@falang/editor-scheme';
import { IVariableTypeEditorComponentParams } from '../util/IVariableTypeEditorComponentParams';

export const ConstantOrVariableComponent: React.FC<IVariableTypeEditorComponentParams> = observer(({ scheme, setVariableType, variableType: vType, x, y, width }) => {
  const t = scheme.frontRoot.lang.t;
  if (!vType) return null;
  return <SelectComponent
    height={CELL_SIZE}
    x={x}
    y={y}
    width={width}
    onChange={(value) => {
      setVariableType({
        ...vType,
        constant: value === '1',
      });
    }}
    options={[/*{
      text: t('logic:constant'),
      value: '1'
    }, */{
      text: t('logic:variable'),
      value: '0'
    }]}
    scheme={scheme}
    value={vType.constant ? '1' : '0'}
  />
});
