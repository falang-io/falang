import { BlockView } from './block-view.js';
import { IconRelativeContainer } from './icon-relative-container.js';
import type { IIconView } from '../types/icon-config.js';
import type { IconStore } from '../store/icon.store.js';
import { checker } from '../checker.js';
import React from 'react';
import type { IIconWithLines, IIconWithOwnLines } from '../types/icon-with-lines.js';
import { observer } from 'mobx-react-lite';
import { useService } from '../hooks/use-service.js';
import { TOKEN_SELECTION } from '../di-tokens.js';
import { Line } from './line.js';

const IconOwnLines: React.FC<{ icon: IIconWithOwnLines }> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  return (
    <>
      {icon.ownLines.map((l, i) => (
        <Line {...l} key={i} selected={isSelected} />
      ))}
    </>
  );
});

const IconLines: React.FC<{ icon: IIconWithLines }> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  return (
    <>
      {icon.lines.map((l, i) => (
        <Line {...l} key={i} selected={isSelected} />
      ))}
    </>
  );
});

export const BaseIconComponent: IIconView<IconStore> = ({ icon }) => (
  <>
    {checker.haveLines(icon) ? <IconLines icon={icon} /> : null}
    <IconRelativeContainer icon={icon}>
      {checker.ownLines(icon) ? <IconOwnLines icon={icon} /> : null}
      <BlockView icon={icon} />
    </IconRelativeContainer>
  </>
);
