import { TPage } from '../core/store/TPage.cmp';
import { observer } from 'mobx-react';
import { SchemeComponent } from '@falang/editor-scheme';
import styled from 'styled-components';

const EditorContainer = styled.div`
  position: absolute;
  top: 50px;
  height: calc(100% - 50px);
  left: 0px;
  width: 100%;
`;

export const EditorComponent: TPage = observer(({ root }) => {
  return <EditorContainer><SchemeComponent scheme={root.documentEditorPage.editor} /></EditorContainer>;
});