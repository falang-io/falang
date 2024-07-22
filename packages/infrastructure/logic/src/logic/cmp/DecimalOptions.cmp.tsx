import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { NumberComponent } from '@falang/editor-scheme';
import { getInEditorBlockStyle } from '@falang/editor-scheme';
import { getInEditorLineStyle } from '../util/getInEditorLineStyle';
import { IVariableTypeEditorComponentParams } from '../util/IVariableTypeEditorComponentParams';

export const DecimalOptionsComponent: React.FC<IVariableTypeEditorComponentParams> = observer(({ scheme, variableType: vType, setVariableType, x, y, width }) => {
  const t = scheme.frontRoot.lang.t;
  if (!vType) return null;
  if(vType.type !== 'number' || vType.numberType !== 'decimal') {
    return null;
  }
  return <>
    <div style={getInEditorLineStyle(scheme, x, y)}>
      {t('logic:digits')}
    </div>
    <div style={{
      ...getInEditorBlockStyle(scheme, x, y + CELL_SIZE, width, 0),
      borderBottom: '1px solid #999',
    }}></div>
    <NumberComponent
      x={x + Math.round(width / 2) - CELL_SIZE * 2}
      y={y}
      width={CELL_SIZE * 2}
      onChange={(value) => {
        setVariableType({
          ...vType,
          digits: value,
        });
      }}
      scheme={scheme}
      value={vType.digits}
    />
    <div style={getInEditorLineStyle(scheme, x + Math.round(width / 2), y)}>
      {t('logic:decimals')}
    </div>
    <NumberComponent
      x={x + width - CELL_SIZE * 2}
      y={y}
      width={CELL_SIZE * 2}
      onChange={(value) => {
        setVariableType({
          ...vType,
          decimals: value,
        });
      }}
      scheme={scheme}
      value={vType.decimals}
    />
  </>
});
