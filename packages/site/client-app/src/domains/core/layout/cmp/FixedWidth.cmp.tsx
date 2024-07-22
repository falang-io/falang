import React from 'react';
import styled from 'styled-components'

const Layout = styled.div`
  margin: 0 auto;
`;

interface FixedWidthProps extends React.PropsWithChildren {
  maxWidth?: number;
}

export const FixedWidth: React.FC<FixedWidthProps> = ({ children, maxWidth }) => 
  <Layout style={{ maxWidth: maxWidth || 1140 }}>{children}</Layout>;
