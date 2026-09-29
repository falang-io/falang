import type { FC } from 'react';
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext.js';
import { $wrapNodeInElement, mergeRegister } from '@lexical/utils';
import type { LexicalCommand, LexicalEditor } from 'lexical';
import {
  $createParagraphNode,
  $createRangeSelection,
  $getSelection,
  $insertNodes,
  $isNodeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  getDOMSelectionFromTarget,
  isHTMLElement,
} from 'lexical';
import type { IImagePayload } from './image-node.js';
import { $createImageNode, $isImageNode, ImageNode } from './image-node.js';

export type TInsertImagePayload = Readonly<IImagePayload>;

export const INSERT_IMAGE_COMMAND: LexicalCommand<TInsertImagePayload> = createCommand('INSERT_IMAGE_COMMAND');

const TRANSPARENT_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const dragImage = typeof document === 'undefined' ? null : document.createElement('img');
if (dragImage) dragImage.src = TRANSPARENT_IMAGE;

declare global {
  interface DragEvent {
    rangeOffset?: number;
    rangeParent?: Node;
  }
}

const $getImageNodeInSelection = (): ImageNode | null => {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const nodes = selection.getNodes();
  const node = nodes[0];
  return $isImageNode(node) ? node : null;
};

const getDragImageData = (event: DragEvent): null | TInsertImagePayload => {
  const dragData = event.dataTransfer?.getData('application/x-lexical-drag');
  if (!dragData) return null;
  const { type, data } = JSON.parse(dragData) as { type: string; data: TInsertImagePayload };
  return type === 'image' ? data : null;
};

const canDropImage = (event: DragEvent): boolean => {
  const target = event.target;
  return Boolean(
    isHTMLElement(target) &&
    !target.closest('code, span.editor-image') &&
    isHTMLElement(target.parentElement) &&
    target.parentElement.closest('div[contenteditable="true"]'),
  );
};

const getDragSelection = (event: DragEvent): Range | null => {
  const domSelection = getDOMSelectionFromTarget(event.target);
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(event.clientX, event.clientY);
  }
  if (event.rangeParent && domSelection !== null) {
    domSelection.collapse(event.rangeParent, event.rangeOffset ?? 0);
    return domSelection.getRangeAt(0);
  }
  return null;
};

const $onDragStart = (event: DragEvent): boolean => {
  const node = $getImageNodeInSelection();
  if (!node) return false;
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return false;
  dataTransfer.setData('text/plain', '_');
  if (dragImage) dataTransfer.setDragImage(dragImage, 0, 0);
  dataTransfer.setData(
    'application/x-lexical-drag',
    JSON.stringify({
      data: {
        altText: node.getAltText(),
        height: node.__height,
        maxWidth: node.__maxWidth,
        src: node.__src,
        width: node.__width,
      },
      type: 'image',
    }),
  );
  return true;
};

const $onDragover = (event: DragEvent): boolean => {
  const node = $getImageNodeInSelection();
  if (!node) return false;
  if (!canDropImage(event)) event.preventDefault();
  return true;
};

const $onDrop = (event: DragEvent, editor: LexicalEditor): boolean => {
  const node = $getImageNodeInSelection();
  if (!node) return false;
  const data = getDragImageData(event);
  if (!data) return false;
  event.preventDefault();
  if (canDropImage(event)) {
    const range = getDragSelection(event);
    node.remove();
    const rangeSelection = $createRangeSelection();
    if (range) rangeSelection.applyDOMRange(range);
    $setSelection(rangeSelection);
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, data);
  }
  return true;
};

/**
 * Registers `INSERT_IMAGE_COMMAND` (wraps the new node in a paragraph when it would otherwise land
 * directly under root/shadow-root — `ImageNode` is inline, and root can't hold inline children
 * directly) plus drag & drop reordering.
 */
export const ImagesPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      throw new Error('ImagesPlugin: ImageNode not registered on editor');
    }

    return mergeRegister(
      editor.registerCommand<TInsertImagePayload>(
        INSERT_IMAGE_COMMAND,
        (payload) => {
          const imageNode = $createImageNode(payload);
          $insertNodes([imageNode]);
          const parent = imageNode.getParentOrThrow();
          if ($isRootOrShadowRoot(parent)) {
            $wrapNodeInElement(imageNode, $createParagraphNode).selectEnd();
          }
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<DragEvent>(DRAGSTART_COMMAND, $onDragStart, COMMAND_PRIORITY_HIGH),
      editor.registerCommand<DragEvent>(DRAGOVER_COMMAND, $onDragover, COMMAND_PRIORITY_LOW),
      editor.registerCommand<DragEvent>(DROP_COMMAND, (event) => $onDrop(event, editor), COMMAND_PRIORITY_HIGH),
    );
  }, [editor]);

  return null;
};
