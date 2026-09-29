import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection.js';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext.js';
import type { BaseSelection } from 'lexical';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DRAGSTART_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { ImageResizer } from './image-resizer.js';
import { $isImageNode } from './image-node.js';
import type { TImageDimension } from './image-node.js';

// A tiny inline placeholder — avoids bundling a separate asset just for the broken-image case.
const BROKEN_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"><path fill="#999" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Zm-2 0H5l4.5-6 3 3.5L15 12l4 5Z"/></svg>';
const BROKEN_IMAGE_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(BROKEN_IMAGE_SVG)}`;

const imageCache = new Map<string, Promise<boolean> | boolean>();

const useSuspenseImage = (src: string): boolean => {
  const cached = imageCache.get(src);
  if (typeof cached === 'boolean') return cached;
  if (!cached) {
    const promise = new Promise<boolean>((resolve) => {
      const img = new Image();
      img.addEventListener('load', () => resolve(false), { once: true });
      img.addEventListener('error', () => resolve(true), { once: true });
      img.src = src;
    }).then((hasError) => {
      imageCache.set(src, hasError);
      return hasError;
    });
    imageCache.set(src, promise);
    throw promise;
  }
  throw cached;
};

const BrokenImage: React.FC = () => (
  <img src={BROKEN_IMAGE_SRC} style={{ height: 64, opacity: 0.4, width: 64 }} draggable={false} alt="Broken image" />
);

interface ILazyImageProps {
  altText: string;
  className: string;
  imageRef: { current: null | HTMLImageElement };
  src: string;
  width: TImageDimension;
  height: TImageDimension;
  onError: () => void;
  onImageClick: (event: MouseEvent) => void;
}

const LazyImage: React.FC<ILazyImageProps> = ({
  altText,
  className,
  imageRef,
  src,
  width,
  height,
  onError,
  onImageClick,
}) => {
  const hasError = useSuspenseImage(src);

  useEffect(() => {
    if (hasError) onError();
  }, [hasError, onError]);

  if (hasError) return <BrokenImage />;

  // Never a forced `width: 100%` — the block never overflows because `max-width` caps it below,
  // but a smaller ("inherit") image keeps its real, unset size instead of being stretched.
  const style: React.CSSProperties = { maxWidth: '100%' };
  if (width !== 'inherit') style.width = width;
  if (height !== 'inherit') style.height = height;

  return (
    <img
      className={className}
      src={src}
      alt={altText}
      ref={imageRef}
      style={style}
      onError={onError}
      onClick={(event) => onImageClick(event.nativeEvent)}
      draggable={false}
    />
  );
};

interface IImageComponentProps {
  nodeKey: string;
  altText: string;
  width: TImageDimension;
  height: TImageDimension;
  src: string;
  maxWidth: number;
}

export const ImageComponent: React.FC<IImageComponentProps> = ({ nodeKey, altText, width, height, src, maxWidth }) => {
  const imageRef = useRef<null | HTMLImageElement>(null);
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const [isResizing, setIsResizing] = useState(false);
  const [editor] = useLexicalComposerContext();
  const [selection, setSelection] = useState<BaseSelection | null>(null);
  const [isLoadError, setIsLoadError] = useState(false);

  const onClick = useCallback(
    (payload: MouseEvent) => {
      if (isResizing) return true;
      if (payload.target === imageRef.current) {
        if (payload.shiftKey) {
          setSelected(!isSelected);
        } else {
          clearSelection();
          setSelected(true);
        }
        return true;
      }
      return false;
    },
    [isResizing, isSelected, setSelected, clearSelection],
  );

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) => {
          const updatedSelection = editorState.read(() => $getSelection());
          setSelection($isNodeSelection(updatedSelection) ? updatedSelection : null);
        }),
        editor.registerCommand(SELECTION_CHANGE_COMMAND, () => false, COMMAND_PRIORITY_LOW),
        // `CLICK_COMMAND` alone never fires for a click landing on this node's own DOM: `@lexical/react`
        // renders every decorator through a `createPortal` into the `<span>` `ImageNode.createDOM`
        // creates (see `useReactDecorators`), and React's synthetic event dispatch for a click inside a
        // portal calls the underlying native event's `stopPropagation()` once it's done walking the
        // *fiber* tree — verified empirically (native `addEventListener('click', …)` probes on every
        // DOM ancestor from the `<img>` up: listeners on the `<img>` and the portal's own `<span>`
        // container both still fire, but nothing above the `<span>` ever sees the event, so it never
        // reaches the contentEditable root where Lexical's own command dispatch listens). The image's
        // own `onClick` prop below (a normal React handler, safe to call `setSelected`/`clearSelection`
        // from directly — see `useLexicalNodeSelection`'s `editor.update()`-wrapped setters) is the real
        // mechanism; this registration is kept only in case some future Lexical/React combination fires
        // it for real (e.g. a non-portaled decorator), and for the DRAGSTART_COMMAND/KEY_*_COMMAND
        // registrations right below it, which target the contentEditable root itself (via keyboard
        // focus) and are unaffected by this.
        editor.registerCommand<MouseEvent>(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
        editor.registerCommand<DragEvent>(
          DRAGSTART_COMMAND,
          (event) => {
            if (event.target === imageRef.current) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_DELETE_COMMAND,
          (event) => {
            if (!isSelected || !$isNodeSelection($getSelection())) return false;
            event?.preventDefault();
            const node = $getNodeByKey(nodeKey);
            if ($isImageNode(node)) node.remove();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND,
          (event) => {
            if (!isSelected || !$isNodeSelection($getSelection())) return false;
            event?.preventDefault();
            const node = $getNodeByKey(nodeKey);
            if ($isImageNode(node)) node.remove();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          () => {
            if (!isSelected) return false;
            clearSelection();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [clearSelection, editor, isSelected, nodeKey, onClick],
  );

  const onResizeStart = () => setIsResizing(true);

  const onResizeEnd = (nextWidth: TImageDimension, nextHeight: TImageDimension) => {
    // Delay hiding the resize handles for a moment so the resize-ending click doesn't clear selection.
    setTimeout(() => setIsResizing(false), 200);
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) node.setWidthAndHeight(nextWidth, nextHeight);
    });
  };

  const isFocused = isSelected || isResizing;

  return (
    <Suspense fallback={null}>
      <>
        {isLoadError ? (
          <BrokenImage />
        ) : (
          <LazyImage
            altText={altText}
            className={isFocused ? 'focused' : ''}
            imageRef={imageRef}
            onImageClick={onClick}
            src={src}
            width={width}
            height={height}
            onError={() => setIsLoadError(true)}
          />
        )}
        {$isNodeSelection(selection) && isFocused && (
          <ImageResizer
            editor={editor}
            imageRef={imageRef}
            maxWidth={maxWidth}
            onResizeStart={onResizeStart}
            onResizeEnd={onResizeEnd}
          />
        )}
      </>
    </Suspense>
  );
};
