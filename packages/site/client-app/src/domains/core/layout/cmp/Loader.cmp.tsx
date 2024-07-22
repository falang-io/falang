import styled from 'styled-components';

export interface ILoaderComponentProps {
  height: number;
}

const LoaderDiv = styled.div`
  display: flex;
  align-items: center;
  flex-grow: 1;
  flex-shrink: 1;
  text-align: center;
`;

export const LoaderComponent: React.FC<ILoaderComponentProps> = ({ 
  height,
}) => (
  <LoaderDiv style={{ height, lineHeight: height }}>
    Loading...
  </LoaderDiv>
);
