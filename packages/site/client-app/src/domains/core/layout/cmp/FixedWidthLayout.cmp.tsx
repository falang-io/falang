import React from 'react';
import styled from 'styled-components'
import { ContentLayout } from './ContentLayout.cmp';

const Layout = styled.div`
  padding: 0 5px;
  margin: 30px auto 20px;
`;

interface FixedWidthLayouProps extends React.PropsWithChildren {
  maxWidth?: number;
}

export const FixedWidthLayout: React.FC<FixedWidthLayouProps> = ({ children, maxWidth }) => 
  <ContentLayout><Layout style={{ maxWidth: maxWidth || 800 }}>{children}</Layout></ContentLayout>;
