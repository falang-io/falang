import type React from 'react';
import { useState } from 'react';

export interface IResizeHandleProps {
  readonly onPointerDown: (event: React.PointerEvent) => void;
  readonly style?: React.CSSProperties;
}

const baseStyle: React.CSSProperties = {
  width: 6,
  flexShrink: 0,
  cursor: 'col-resize',
  userSelect: 'none',
  touchAction: 'none',
  background: 'transparent',
};

const hoverStyle: React.CSSProperties = {
  background: 'rgba(22, 119, 255, 0.35)',
};

/** A thin drag handle for a resizable side panel — pair with `useResizablePanelWidth`, placing this as
 *  a sibling `<div>` between the panel and the rest of the layout. */
export const ResizeHandle: React.FC<IResizeHandleProps> = ({ onPointerDown, style }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...baseStyle, ...(hover ? hoverStyle : null), ...style }}
    />
  );
};
