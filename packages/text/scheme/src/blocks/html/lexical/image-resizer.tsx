// oxlint-disable unicorn/prefer-math-trunc -- bit-shifted flag constants (Direction), not numeric truncation
// oxlint-disable no-bitwise -- Direction is a bitmask so a corner handle can combine two edges, matching the Lexical playground's own resizer
import type { LexicalEditor } from 'lexical';
import { calculateZoomLevel } from '@lexical/utils';
import { useRef } from 'react';
import type { TImageDimension } from './image-node.js';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const Direction = {
  east: 1 << 0,
  north: 1 << 3,
  south: 1 << 1,
  west: 1 << 2,
};

interface IImageResizerProps {
  editor: LexicalEditor;
  imageRef: { current: null | HTMLElement };
  maxWidth?: number;
  onResizeStart: () => void;
  onResizeEnd: (width: TImageDimension, height: TImageDimension) => void;
}

/**
 * 8 drag handles around a selected image. The 4 corner handles preserve aspect ratio (matching the
 * dragged corner's dominant axis to the opposite corner); the 4 edge handles resize a single axis
 * freely — same behavior as the Lexical playground's own resizer.
 */
export const ImageResizer: React.FC<IImageResizerProps> = ({
  onResizeStart,
  onResizeEnd,
  imageRef,
  maxWidth,
  editor,
}) => {
  const controlWrapperRef = useRef<HTMLDivElement>(null);
  const userSelect = useRef({ priority: '', value: 'default' });
  const positioningRef = useRef<{
    currentHeight: TImageDimension;
    currentWidth: TImageDimension;
    direction: number;
    isResizing: boolean;
    ratio: number;
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
  }>({
    currentHeight: 0,
    currentWidth: 0,
    direction: 0,
    isResizing: false,
    ratio: 0,
    startHeight: 0,
    startWidth: 0,
    startX: 0,
    startY: 0,
  });
  const editorRootElement = editor.getRootElement();
  const maxWidthContainer =
    maxWidth ?? (editorRootElement === null ? 100 : editorRootElement.getBoundingClientRect().width - 20);
  const maxHeightContainer = editorRootElement === null ? 100 : editorRootElement.getBoundingClientRect().height - 20;

  const minWidth = 50;
  const minHeight = 50;

  const setStartCursor = (direction: number) => {
    const ew = direction === Direction.east || direction === Direction.west;
    const ns = direction === Direction.north || direction === Direction.south;
    const nwse =
      (Boolean(direction & Direction.north) && Boolean(direction & Direction.west)) ||
      (Boolean(direction & Direction.south) && Boolean(direction & Direction.east));
    // eslint-disable-next-line no-nested-ternary
    const cursorDir = ew ? 'ew' : ns ? 'ns' : nwse ? 'nwse' : 'nesw';

    if (editorRootElement !== null) {
      editorRootElement.style.setProperty('cursor', `${cursorDir}-resize`, 'important');
    }
    document.body.style.setProperty('cursor', `${cursorDir}-resize`, 'important');
    userSelect.current.value = document.body.style.getPropertyValue('-webkit-user-select');
    userSelect.current.priority = document.body.style.getPropertyPriority('-webkit-user-select');
    document.body.style.setProperty('-webkit-user-select', 'none', 'important');
  };

  const setEndCursor = () => {
    if (editorRootElement !== null) editorRootElement.style.setProperty('cursor', 'text');
    document.body.style.setProperty('cursor', 'default');
    document.body.style.setProperty('-webkit-user-select', userSelect.current.value, userSelect.current.priority);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const image = imageRef.current;
    const positioning = positioningRef.current;

    const isHorizontal = Boolean(positioning.direction & (Direction.east | Direction.west));
    const isVertical = Boolean(positioning.direction & (Direction.south | Direction.north));

    if (image === null || !positioning.isResizing) return;
    const zoom = calculateZoomLevel(image);
    if (isHorizontal && isVertical) {
      let diff = Math.floor(positioning.startX - event.clientX / zoom);
      diff = positioning.direction & Direction.east ? -diff : diff;
      const width = clamp(positioning.startWidth + diff, minWidth, maxWidthContainer);
      const height = width / positioning.ratio;
      image.style.width = `${width}px`;
      image.style.height = `${height}px`;
      positioning.currentHeight = height;
      positioning.currentWidth = width;
    } else if (isVertical) {
      let diff = Math.floor(positioning.startY - event.clientY / zoom);
      diff = positioning.direction & Direction.south ? -diff : diff;
      const height = clamp(positioning.startHeight + diff, minHeight, maxHeightContainer);
      image.style.height = `${height}px`;
      positioning.currentHeight = height;
    } else {
      let diff = Math.floor(positioning.startX - event.clientX / zoom);
      diff = positioning.direction & Direction.east ? -diff : diff;
      const width = clamp(positioning.startWidth + diff, minWidth, maxWidthContainer);
      image.style.width = `${width}px`;
      positioning.currentWidth = width;
    }
  };

  const handlePointerUp = () => {
    const image = imageRef.current;
    const positioning = positioningRef.current;
    const controlWrapper = controlWrapperRef.current;
    if (image !== null && controlWrapper !== null && positioning.isResizing) {
      const width = positioning.currentWidth;
      const height = positioning.currentHeight;
      positioning.isResizing = false;
      controlWrapper.classList.remove('image-control-wrapper--resizing');
      setEndCursor();
      onResizeEnd(width, height);
    }
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, direction: number) => {
    if (!editor.isEditable()) return;
    const image = imageRef.current;
    const controlWrapper = controlWrapperRef.current;
    if (image === null || controlWrapper === null) return;
    event.preventDefault();
    const { width, height } = image.getBoundingClientRect();
    const zoom = calculateZoomLevel(image);
    const positioning = positioningRef.current;
    positioning.startWidth = width;
    positioning.startHeight = height;
    positioning.ratio = width / height;
    positioning.currentWidth = width;
    positioning.currentHeight = height;
    positioning.startX = event.clientX / zoom;
    positioning.startY = event.clientY / zoom;
    positioning.isResizing = true;
    positioning.direction = direction;

    setStartCursor(direction);
    onResizeStart();

    controlWrapper.classList.add('image-control-wrapper--resizing');
    image.style.height = `${height}px`;
    image.style.width = `${width}px`;

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div ref={controlWrapperRef}>
      <div
        className="image-resizer image-resizer-n"
        onPointerDown={(event) => handlePointerDown(event, Direction.north)}
      />
      <div
        className="image-resizer image-resizer-ne"
        onPointerDown={(event) => handlePointerDown(event, Direction.north | Direction.east)}
      />
      <div
        className="image-resizer image-resizer-e"
        onPointerDown={(event) => handlePointerDown(event, Direction.east)}
      />
      <div
        className="image-resizer image-resizer-se"
        onPointerDown={(event) => handlePointerDown(event, Direction.south | Direction.east)}
      />
      <div
        className="image-resizer image-resizer-s"
        onPointerDown={(event) => handlePointerDown(event, Direction.south)}
      />
      <div
        className="image-resizer image-resizer-sw"
        onPointerDown={(event) => handlePointerDown(event, Direction.south | Direction.west)}
      />
      <div
        className="image-resizer image-resizer-w"
        onPointerDown={(event) => handlePointerDown(event, Direction.west)}
      />
      <div
        className="image-resizer image-resizer-nw"
        onPointerDown={(event) => handlePointerDown(event, Direction.north | Direction.west)}
      />
    </div>
  );
};
