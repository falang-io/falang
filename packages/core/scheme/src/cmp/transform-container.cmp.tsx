import styled from '@emotion/styled';
import type { Scheme } from '../scheme/scheme.js';
import { observer } from 'mobx-react-lite';

const PositionContainerDiv = styled.div`
  position: absolute;
`;

const TransformContainerDiv = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
`;

export const TransformContainerComponent: React.FC<{ scheme: Scheme } & React.PropsWithChildren> = observer(
  ({ scheme, children }) => (
    <PositionContainerDiv style={{ left: scheme.viewPosition.x, top: scheme.viewPosition.y }}>
      <TransformContainerDiv style={{ transform: `scale(${scheme.viewPosition.scale})` }}>
        {children}
      </TransformContainerDiv>
    </PositionContainerDiv>
  ),
);
