import { observer } from 'mobx-react-lite';
import type { IconStore } from '../store/icon.store.js';
import styled from '@emotion/styled';

const IconRelativeContainerBase = styled.div`
  position: absolute;
`;

export const IconRelativeContainer: React.FC<{ icon: IconStore } & React.PropsWithChildren> = observer(
  ({ icon, children }) => (
    <IconRelativeContainerBase
      style={{
        left: icon.x,
        top: icon.y,
      }}
    >
      {children}
    </IconRelativeContainerBase>
  ),
);
