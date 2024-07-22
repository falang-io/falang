import { IBlockInBlock } from '../common/IBlockInBlock'
import * as React from 'react';

interface IBlockInBlockComponentParams {
  blocks: IBlockInBlock<unknown>[]
}

export const BlocksInBlockViewComponent: React.FC<IBlockInBlockComponentParams> = ({ blocks }) => {
  return <>{blocks.map((block, index) => {
    const Background = block.getBackground();
    const View = block.getRenderer();
    return <React.Fragment key={index}>
      <Background store={block} />
      <View store={block} />
    </React.Fragment>
  })}</>
}


export const BlocksInBlockEditorComponent: React.FC<IBlockInBlockComponentParams> = ({ blocks }) => {
  return <>{blocks.map((block, index) => {
    const Editor = block.getEditor();
    const View = block.getRenderer();
    return <React.Fragment key={index}>
      <Editor store={block} />
      <View store={block} />
    </React.Fragment>
  })}</>
}