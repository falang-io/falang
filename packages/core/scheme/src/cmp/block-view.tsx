import { observer } from 'mobx-react-lite';
import type { IconStore } from '../store/icon.store.js';
import { useService } from '../hooks/use-service.js';
import { TOKEN_CSS_CLASSES, TOKEN_I18N, TOKEN_SCHEME } from '../di-tokens.js';
import { CELL_SIZE } from '../constants.js';
import React, { useLayoutEffect, useRef } from 'react';
import useResizeObserver from '@react-hook/resize-observer';
import { runInAction } from 'mobx';
import styled from '@emotion/styled';
import type { ITheme } from '../types/theme.js';
import type { Scheme } from '../scheme/scheme.js';
import {
  CMD_ICON_CONTEXT_MENU,
  CMD_ICON_MOUSE_CLICK,
  CMD_ICON_MOUSE_DOUBLE_CLICK,
  CMD_ICON_MOUSE_DOWN,
  CMD_ICON_MOUSE_MOVE,
  CMD_ICON_MOUSE_OVER,
  CMD_ICON_MOUSE_UP,
} from '../scheme/scheme-commands.js';

const calculateHeight = (h: number, minHeight?: number) =>
  Math.max(Math.ceil(h / CELL_SIZE) * CELL_SIZE, minHeight ?? CELL_SIZE);

const BlockTitleDiv = styled.div`
  font-weight: bold;
  line-height: ${CELL_SIZE - 1}px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
`;

const BlockTitle: React.FC<{ icon: IconStore }> = observer(({ icon }) => {
  const t = useService(TOKEN_I18N).t;
  if (!icon.title) return null;
  return <BlockTitleDiv className="block-title">{t(icon.title)}</BlockTitleDiv>;
});

const BlockContainer: React.FC<{ icon: IconStore } & React.PropsWithChildren> = observer(({ icon, children }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    setTimeout(() => {
      runInAction(() => {
        if (!ref.current) return;
        icon.blockHeight = calculateHeight(
          ref.current.clientHeight,
          icon.config.block.minHeight ?? icon.config.shape.minHeight,
        );
      });
    });
  }, [ref.current]);

  useResizeObserver(ref, (target) => {
    runInAction(() => {
      icon.blockHeight = calculateHeight(target.contentRect.height, icon.config.block.minHeight);
    });
  });

  const blockPosition = icon.blockPosition;
  return (
    <div
      ref={ref}
      className="block-container"
      style={{
        position: 'absolute',
        left: blockPosition.x,
        top: blockPosition.y + icon.config.shape.paddings.top,
        width: blockPosition.width,
      }}
    >
      <BlockTitle icon={icon} />
      {children}
    </div>
  );
});

export const BlockShapeContainer = styled.div<{ theme: ITheme }>`
  div.block-body {
    position: absolute;
    border-style: solid;
    border-width: 1px;
    border-radius: 4px;
    border-color: ${({ theme }) => theme.iconBorderColor};
    background-color: ${({ theme }) => theme.iconBackground};
  }
  div.block-body.selected {
    border-color: ${({ theme }) => theme.selectedBorderColor};
  }
  svg {
    position: absolute;
    display: block;
  }
  svg .block-body {
    stroke: ${({ theme }) => theme.iconBorderColor};
    fill: ${({ theme }) => theme.iconBackground};
  }
  svg .block-body.selected {
    stroke: ${({ theme }) => theme.selectedBorderColor};
  }
`;

const BlockEventsDiv: React.FC<{ icon: IconStore; scheme: Scheme } & React.PropsWithChildren> = ({
  icon,
  scheme,
  children,
}) => (
  <div
    onClick={(e) => scheme.commands.dispatchCommand(CMD_ICON_MOUSE_CLICK, { e, icon })}
    onMouseDown={(e) => scheme.commands.dispatchCommand(CMD_ICON_MOUSE_DOWN, { e, icon })}
    onMouseUp={(e) => scheme.commands.dispatchCommand(CMD_ICON_MOUSE_UP, { e, icon })}
    onDoubleClick={(e) => scheme.commands.dispatchCommand(CMD_ICON_MOUSE_DOUBLE_CLICK, { e, icon })}
    onContextMenu={(e) => scheme.commands.dispatchCommand(CMD_ICON_CONTEXT_MENU, { e, icon })}
    onMouseOver={(e) => scheme.commands.dispatchCommand(CMD_ICON_MOUSE_OVER, { e, icon })}
    onMouseMove={(e) => scheme.commands.dispatchCommand(CMD_ICON_MOUSE_MOVE, { e, icon })}
  >
    {children}
  </div>
);

export const BlockView: React.FC<{ icon: IconStore }> = observer(({ icon }) => {
  const blockPosition = icon.blockPosition;
  if (blockPosition.width === 0) return null;
  const scheme = useService(TOKEN_SCHEME);
  const cssClasses = useService(TOKEN_CSS_CLASSES);
  const shapeClassName = cssClasses.getBlockBodyClassName(icon.id);
  const ShapeView = icon.config.shape.view;
  const BlockInnerView = icon.config.block.view;
  const BlockExtraView = scheme.extraView.blockExtraView;
  return (
    <BlockEventsDiv icon={icon} scheme={scheme}>
      <BlockShapeContainer theme={scheme.theme.value}>
        <ShapeView {...blockPosition} className={shapeClassName} height={icon.blockHeight} />
      </BlockShapeContainer>
      <BlockContainer icon={icon} key={icon.id}>
        {BlockExtraView ? (
          <BlockExtraView icon={icon} />
        ) : (
          <BlockInnerView data={icon.dataNode.data} width={blockPosition.width} icon={icon} />
        )}
      </BlockContainer>
    </BlockEventsDiv>
  );
});
