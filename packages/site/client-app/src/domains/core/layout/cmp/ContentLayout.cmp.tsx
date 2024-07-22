import React from 'react';
import styled from 'styled-components'

const Layout = styled.div`
  position: absolute;
  top: 50px;
  left: 0px;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: auto;
  height: calc(100% - 50px);
  width: 100%;
`;

export const ContentLayout: React.FC<React.PropsWithChildren> = ({ children }) => 
  <Layout>{children}</Layout>;
