import type React from 'react';
import { observer } from 'mobx-react-lite';
import type { Scheme } from '@falang/scheme';
import { SchemeContainer } from '@falang/scheme';
import { appTheme } from '../theme.js';

const styles = {
  root: {
    position: 'relative' as const,
    flex: 1,
    overflow: 'hidden',
    background: appTheme.background,
  },
};

interface Props {
  scheme: Scheme;
}

export const SchemeView: React.FC<Props> = observer(({ scheme }) => (
  <div style={styles.root}>
    <SchemeContainer scheme={scheme} />
  </div>
));
