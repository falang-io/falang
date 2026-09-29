import styled from '@emotion/styled';
import type { Scheme } from '../scheme/scheme.js';
import { observer } from 'mobx-react-lite';
import { CELL_SIZE, FONT_SIZE } from '../constants.js';
import { TransformContainerComponent } from './transform-container.cmp.js';
import { IconView } from './icon-view.js';
import { ContainerContext } from '../hooks/container.context.js';
import { BackgroundGridComponent } from './background-grid.cmp.js';
import type { ITheme } from '../types/theme.js';
import React, { useMemo } from 'react';
import {
  CMD_SCHEME_CONTEXT_MENU,
  CMD_SCHEME_MOUSE_CLICK,
  CMD_SCHEME_MOUSE_DOWN,
  CMD_SCHEME_MOUSE_LEAVE,
  CMD_SCHEME_MOUSE_MOVE,
  CMD_SCHEME_MOUSE_UP,
  CMD_SCHEME_MOUSE_WHEEL,
} from '../scheme/scheme-commands.js';
import { resolveService } from '@falang/di';
import { TOKEN_CSS_CLASSES } from '../di-tokens.js';

const SchemeContainerDiv = styled.div<{ theme: ITheme; extraCss: string }>`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: ${(props) => props.theme.background};
  color: ${(props) => props.theme.textColor};
  font-family:
    Courier New,
    monospace;
  font-size: ${FONT_SIZE}px;
  line-height: ${CELL_SIZE}px;
  overflow: hidden;
  font-weight: 400;
  transform-origin: 0 0;

  .vertical-line {
    position: absolute;
    width: 0px;
    border-left: 2px solid ${(props) => props.theme.iconBorderColor};
  }
  .vertical-line.dashed {
    border-left-style: dashed;
  }
  .horizontal-line {
    position: absolute;
    height: 0px;
    border-top: 2px solid ${(props) => props.theme.iconBorderColor};
  }
  .horizontal-line.dashed {
    border-top-style: dashed;
  }
  ${(props) => props.extraCss}
`;

export const SchemeContainer: React.FC<{ scheme: Scheme }> = observer(({ scheme }) => {
  const root = scheme.rootNode;
  const rootIcon = root ? scheme.icons.getIconSafe(root.id) : null;

  const divProps = useMemo<
    React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & { theme: ITheme }
  >(
    () => ({
      theme: scheme.theme.value,
      id: scheme.rootDivId,
      onWheel: (e) => scheme.commands.dispatchCommand(CMD_SCHEME_MOUSE_WHEEL, e),
      onMouseMove: (e) => scheme.commands.dispatchCommand(CMD_SCHEME_MOUSE_MOVE, e),
      onClick: (e) => scheme.commands.dispatchCommand(CMD_SCHEME_MOUSE_CLICK, e),
      onMouseUp: (e) => scheme.commands.dispatchCommand(CMD_SCHEME_MOUSE_UP, e),
      onMouseDown: (e) => scheme.commands.dispatchCommand(CMD_SCHEME_MOUSE_DOWN, e),
      onMouseLeave: (e) => scheme.commands.dispatchCommand(CMD_SCHEME_MOUSE_LEAVE, e),
      onContextMenu: (e) => scheme.commands.dispatchCommand(CMD_SCHEME_CONTEXT_MENU, e),
    }),
    [scheme, scheme.theme.value, scheme.rootDivId],
  );

  const schemeLayers = scheme.extraView.getSchemeLayers();
  const coreLayers = scheme.extraView.getCoreLayers();
  const css = resolveService(TOKEN_CSS_CLASSES, scheme.container);

  return (
    <SchemeContainerDiv {...divProps} extraCss={css.getRootExtraCss(scheme.theme.value)}>
      <BackgroundGridComponent scheme={scheme} />
      <TransformContainerComponent scheme={scheme}>
        {rootIcon ? <IconView icon={rootIcon} /> : null}
        {schemeLayers.map((Layer, index) => (
          <Layer key={index} />
        ))}
      </TransformContainerComponent>
      {coreLayers.map((Layer, index) => (
        <Layer key={index} />
      ))}
    </SchemeContainerDiv>
  );
});

export const SchemeComponent: React.FC<{ scheme: Scheme }> = observer(({ scheme }) => (
  <ContainerContext value={scheme.container}>
    <SchemeContainer scheme={scheme} />
  </ContainerContext>
));
