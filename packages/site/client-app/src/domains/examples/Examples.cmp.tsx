import { IdeComponent } from '@falang/editor-ide';
import { observer } from 'mobx-react';
import styled from 'styled-components';
import { TPage } from '../core/store/TPage.cmp';

const Layout = styled.div`
  position: absolute;
  top: 50px;
  left: 0px;
  display: flex;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: hidden;
  height: calc(100% - 50px);
  width: 100%;
  & > * {
    width: 100%;
  }
  flex-wrap: wrap;
`;

const EditorLayout = styled.div`
  position: relative;
  flex: 1;
`;


export const ExamplesPageComponent: TPage = observer(({ root }) => {
  const page = root.examplesPage;
  if(!page.ide) return null;
  return <Layout>
    <IdeComponent ide={page.ide} />

  </Layout>
});