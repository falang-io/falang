import { useCallback, useEffect, useRef, useState } from 'react';
import type { LexicalCommand, LexicalEditor, ElementFormatType, RangeSelection } from 'lexical';
import {
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { $isAtNodeEnd } from '@lexical/selection';
import { mergeRegister } from '@lexical/utils';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  ItalicOutlined,
  MenuOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { INSERT_IMAGE_COMMAND } from './lexical/images-plugin.js';

// Same helper as the Lexical playground's `getSelectedNode` — the anchor and focus can land on
// different text nodes, so which one is "the" selected node for reading format state depends on
// selection direction and whether a point sits at a node's boundary.
const getSelectedNode = (selection: RangeSelection) => {
  const anchor = selection.anchor;
  const focus = selection.focus;
  const anchorNode = anchor.getNode();
  const focusNode = focus.getNode();
  if (anchorNode === focusNode) return anchorNode;
  if (selection.isBackward()) {
    return $isAtNodeEnd(focus) ? anchorNode : focusNode;
  }
  return $isAtNodeEnd(anchor) ? anchorNode : focusNode;
};

const stopMouseDown = (e: React.MouseEvent) => e.preventDefault();

// `dispatchCommand`'s payload parameter is required even for a `LexicalCommand<void>` — this
// centralizes the one spot that needs the (otherwise oxlint-flagged) literal `undefined`.
const dispatchVoidCommand = (editor: LexicalEditor, command: LexicalCommand<void>) => {
  // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- see comment above.
  editor.dispatchCommand(command, undefined);
};

interface IToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<IToolbarButtonProps> = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    className={`html-toolbar-item${active ? ' active' : ''}`}
    title={title}
    disabled={disabled}
    onMouseDown={stopMouseDown}
    onClick={onClick}
  >
    {children}
  </button>
);

const ImageButton: React.FC<{ editor: LexicalEditor }> = ({ editor }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.addEventListener('load', () => {
            if (typeof reader.result === 'string') {
              editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src: reader.result });
            }
          });
          reader.readAsDataURL(file);
          e.currentTarget.value = '';
        }}
      />
      <ToolbarButton onClick={() => inputRef.current?.click()} title="Insert image">
        <PictureOutlined />
      </ToolbarButton>
    </>
  );
};

/**
 * Floats just above the block (`position: absolute; bottom: 100%`, see `html-block.css`) so it
 * never contributes to the block's own measured height — `BlockContainer` in
 * `@falang/scheme`'s `block-view.tsx` sizes the block from a `ResizeObserver` on its normal-flow
 * content only.
 */
export const HtmlBlockToolbar: React.FC<{ editor: LexicalEditor }> = ({ editor }) => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [format, setFormat] = useState<ElementFormatType | ''>('left');

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    setIsBold(selection.hasFormat('bold'));
    setIsItalic(selection.hasFormat('italic'));
    setIsUnderline(selection.hasFormat('underline'));
    setIsStrikethrough(selection.hasFormat('strikethrough'));
    const node = getSelectedNode(selection);
    const parent = node.getParent();
    setFormat(($isElementNode(node) ? node.getFormatType() : parent?.getFormatType()) || 'left');
  }, []);

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            updateToolbar();
            return false;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
        editor.registerUpdateListener(({ editorState }) => editorState.read(updateToolbar)),
        editor.registerCommand<boolean>(
          CAN_UNDO_COMMAND,
          (payload) => {
            setCanUndo(payload);
            return false;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
        editor.registerCommand<boolean>(
          CAN_REDO_COMMAND,
          (payload) => {
            setCanRedo(payload);
            return false;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
      ),
    [editor, updateToolbar],
  );

  return (
    <div
      className="html-block-toolbar"
      onMouseDown={stopMouseDown}
      onMouseUp={stopMouseDown}
      onMouseMove={stopMouseDown}
    >
      <ToolbarButton onClick={() => dispatchVoidCommand(editor, UNDO_COMMAND)} disabled={!canUndo} title="Undo">
        <UndoOutlined />
      </ToolbarButton>
      <ToolbarButton onClick={() => dispatchVoidCommand(editor, REDO_COMMAND)} disabled={!canRedo} title="Redo">
        <RedoOutlined />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} active={isBold} title="Bold">
        <BoldOutlined />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        active={isItalic}
        title="Italic"
      >
        <ItalicOutlined />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        active={isUnderline}
        title="Underline"
      >
        <UnderlineOutlined />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
        active={isStrikethrough}
        title="Strikethrough"
      >
        <StrikethroughOutlined />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}
        active={format === 'left'}
        title="Align left"
      >
        <AlignLeftOutlined />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}
        active={format === 'center'}
        title="Align center"
      >
        <AlignCenterOutlined />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}
        active={format === 'right'}
        title="Align right"
      >
        <AlignRightOutlined />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify')}
        active={format === 'justify'}
        title="Justify"
      >
        <MenuOutlined />
      </ToolbarButton>
      <ToolbarButton onClick={() => dispatchVoidCommand(editor, INSERT_UNORDERED_LIST_COMMAND)} title="Bullet list">
        <UnorderedListOutlined />
      </ToolbarButton>
      <ToolbarButton onClick={() => dispatchVoidCommand(editor, INSERT_ORDERED_LIST_COMMAND)} title="Numbered list">
        <OrderedListOutlined />
      </ToolbarButton>
      <ImageButton editor={editor} />
    </div>
  );
};
