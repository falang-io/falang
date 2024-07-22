import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { CodeComponent } from '@falang/infrastructure-code';
import { TextComponent } from '@falang/infrastructure-text';
import { CallFunctionBlockStore } from './CallFunction.block.store';
import { CallFunctionBgBlockComponent } from './CallFunctionBg.block.cmp';

export const CallFunctionBlockComponent: React.FC<{ block: CallFunctionBlockStore }> = observer(({ block }) => {
  const functionData = block.currentFunctionData;
  if (!functionData) return null;
  let y = block.position.y + CELL_SIZE;
  const maxParameterWidth = block.maxParameterWidth;
  return <>
    <CallFunctionBgBlockComponent block={block} />
    {block.parametersExpressions.map((p, index) => {
      const currentY = y;
      y+= p.height;
      return <CodeComponent
        key={index}
        code={p.code}
        x={block.position.x + maxParameterWidth}
        y={currentY}
      />;
    })}
    {block.functionHaveReturn ? <TextComponent
      store={block.returnExpression}
      x={block.position.x + maxParameterWidth}
      y={block.position.y + CELL_SIZE + functionData.parameters.length * CELL_SIZE}
    /> : null}
  </>;
});