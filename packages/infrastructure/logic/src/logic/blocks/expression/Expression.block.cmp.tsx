import { observer } from "mobx-react";
import { TBlockComponent } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { schemeBaseTextStyle } from '@falang/editor-scheme';
import { TypeViewComponent } from '../../cmp/TypeView.cmp';
import { ExpressionComponent } from '../../expression/Expression.cmp';
import { ExpressionBlockStore } from './Expression.block.store';
/*
const CreateInputsComponent: React.FC<{ block: ExpressionBlockStore }> = observer(({ block }) => {
  const t = block.scheme.frontRoot.lang.t;
  const vType = block.variableType;
  if (!vType) return null;
  const expressionHeight = block.expressionStore.height;
  return <>
    <text
      style={textStyle}
      className='inblock-text'
      x={block.position.x + 4}
      y={block.position.y + CELL_SIZE - 4}
    >
      {block.variableType.constant ? t('logic:constant') : t('logic:variable')}
    </text>
    <line
      className='inblock-line'
      x1={block.position.x}
      x2={block.position.x + block.shape.width}
      y1={block.position.y + CELL_SIZE}
      y2={block.position.y + CELL_SIZE}
    />
    <InlineTypeViewComponent
      scheme={block.scheme}
      variableType={block.variableType}
      width={block.width}
      x={block.position.x}
      y={block.position.y + expressionHeight + CELL_SIZE}
    />
    {vType.type === 'array' ? <InlineTypeViewComponent
      scheme={block.scheme}
      variableType={vType.elementType}
      width={block.width}
      x={block.position.x}
      y={block.position.y + expressionHeight + CELL_SIZE * 2}
    /> : null}
  </>;
});
*/
export const ExpressionBlockComponent: TBlockComponent<ExpressionBlockStore> = observer(({ block }) => {
  const expressionHeight = block.expressionStore.height;
  const t = block.scheme.frontRoot.lang.t;
  return <>
    {block.type === 'create' && block.variableType ? <>
      <text
        style={schemeBaseTextStyle}
        className='inblock-text'
        x={block.position.x + 4}
        y={block.position.y + CELL_SIZE - 4}
      >
        {/*block.variableType.constant ? t('logic:constant') : t('logic:variable')*/}
        {t('logic:variable')}
      </text>
      <line
        className='inblock-line'
        x1={block.position.x}
        x2={block.position.x + block.shape.width}
        y1={block.position.y + CELL_SIZE}
        y2={block.position.y + CELL_SIZE}
      />
      <TypeViewComponent
        scheme={block.scheme}
        variableType={block.variableType}
        width={block.width}
        x={block.position.x}
        y={block.position.y + expressionHeight + CELL_SIZE}
        projectStore={block.projectStore}
      />
    </> : null}
    <ExpressionComponent store={block.expressionStore} x={block.position.x} y={block.position.y + (block.type === 'create' ? CELL_SIZE : 0)} />
  </>;
});
