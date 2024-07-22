import { observer } from 'mobx-react';
import React from 'react';
import styled from 'styled-components';
import { useRoot } from '../../store/Root.context';
import { LayoutHeader } from './LayoutHeader.cmp';
import { DropDownMenuComponent } from '../../dropdown/cmp/DropDownMenu.cmp';


const Layout = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

export const LayoutComponent: React.FC<React.PropsWithChildren> = observer(({ children }) => {
  const root = useRoot();
  return (
    <Layout>
      <LayoutHeader />
      {children}
      {root.busy ? (
        <div className='blocking-loader'>
          <div className="lds-ellipsis"><div></div><div></div><div></div><div></div></div>
        </div>
      ) : null}
      <DropDownMenuComponent dd={root.dropdown} />
    </Layout>
  );
});
