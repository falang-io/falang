import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { Text2Component } from '@falang/infrastructure-text';
import { schemeBaseTextStyle } from '@falang/editor-scheme';
import { TypeView2Component } from '../../cmp/TypeView2.cmp';
import { getInlineTypeHeight } from '../../util/getInlineTypeHeight';
import { FunctionHeaderBlockStore } from './FunctionHeader.block.store';
import { FunctionHeaderLinesComponent } from './FunctionHeader.lines.cmp';

export const FunctionHeaderBlockComponent: React.FC<{ block: FunctionHeaderBlockStore }> = observer(({ block }) => {
  const by = block.position.y;
  let y = by + CELL_SIZE * 3;
  const x = block.position.x;
  const t = block.scheme.frontRoot.lang.t;
  const w = block.shape.width;
  const ph = block.parametersHeight;
  const nw = block.namesWidth;
  return <>
  <FunctionHeaderLinesComponent block={block} />
    {/*<TextComponent
      store={block.nameStore}
      x={x + CELL_SIZE}
      y={by}
    />*/}
    

    {block.parameters.length
      ? block.parameters.map((p) => {
        return <>
          <Text2Component 
            store={p.nameStore}
          />
          <TypeView2Component
            store={p.typeStore}
          />
        </>
      })
      : <text
        className='inblock-text'
        style={schemeBaseTextStyle}
        x={x + w - CELL_SIZE * 4}
        y={by + CELL_SIZE * 3 + ph - 4}
      >
        {t('logic:void')}
      </text>}

    {block.returnStore.get().type !== 'void'
      ? <TypeView2Component store={block.returnStore} />
      : <text
        className='inblock-text'
        style={schemeBaseTextStyle}
        x={x + block.maxParameterWidth + 4}
        y={by + CELL_SIZE * 4 + ph - 4}
      >
        {t('logic:void')}
      </text>}
  </>;
});
