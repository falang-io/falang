import { observer } from 'mobx-react';
import { FunctionHeaderBlockStore } from './FunctionHeader.block.store';
import { CELL_SIZE } from '@falang/editor-scheme';
import React from 'react';
import { getInEditorBlockStyle } from '@falang/editor-scheme';
import { TBlockComponent } from '@falang/editor-scheme';
import { CommonBlockEditorComponent } from '@falang/editor-scheme';

export const FunctionHeaderBlockEditorComponent: TBlockComponent<FunctionHeaderBlockStore> = observer(({ block }) => {
  const by = block.position.y;
  const bx = block.position.x;
  const ph = block.parametersHeight;
  const w = block.shape.width;
  //CommonBlockEditorComponent
  return <>    
    {/*<TextEditorComponent
      id='function-name-editor'
      onChange={(v) => block.nameStore.setText(v)}
      onClose={() => block.scheme.editing.onCtrlEnter()}
      style={getTextAreaStyle({
        height: CELL_SIZE * 2,
        scheme: block.scheme,
        width: w - CELL_SIZE * 2,
        x: bx + CELL_SIZE,
        y: by,
      })}
      value={block.nameStore.text}
    />*/}
    {/*<div style={getInEditorLineStyle(icon.scheme, block.position.x, block.position.y + CELL_SIZE * 2)}>
      {t('logic:func_parameters')}
    </div>*/}
    <CommonBlockEditorComponent block={block} />
    {block.parameters.map(((p, i) => {
      return <React.Fragment key={i}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            block.removeParameter(i)
          }}
          style={{
            ...getInEditorBlockStyle(block.scheme, bx + w, p.position.y, CELL_SIZE, CELL_SIZE),
            border: '1px solid #ccc',
          }}
        >-</button>
      </React.Fragment>;
    }))}
    <button
      onClick={(e) => {
        e.stopPropagation();
        block.addParameter()
      }}
      style={{
        ...getInEditorBlockStyle(block.scheme, bx + w, by + CELL_SIZE * 3 + ph, CELL_SIZE, CELL_SIZE),
        border: '1px solid #ccc',
      }}
    >+</button>
  </>;
});
