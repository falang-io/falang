import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import type { JSX } from 'react';
import { DecoratorNode } from 'lexical';
import { ImageComponent } from './image-component.js';

/** `'inherit'` means "no explicit size — let the browser size the `<img>` naturally". */
export type TImageDimension = number | 'inherit';

export interface IImagePayload {
  src: string;
  altText?: string;
  width?: TImageDimension;
  height?: TImageDimension;
  maxWidth?: number;
  key?: NodeKey;
}

export type TSerializedImageNode = Spread<
  {
    altText: string;
    height?: number;
    maxWidth: number;
    src: string;
    width?: number;
  },
  SerializedLexicalNode
>;

const isGoogleDocCheckboxImg = (img: HTMLImageElement): boolean =>
  img.parentElement !== null &&
  img.parentElement.tagName === 'LI' &&
  img.previousSibling === null &&
  img.getAttribute('aria-roledescription') === 'checkbox';

const readDimensionAttribute = (img: HTMLImageElement, attribute: 'width' | 'height'): number | undefined => {
  const raw = img.getAttribute(attribute);
  if (!raw) return;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return;
  return parsed;
};

const $convertImageElement = (domNode: Node): DOMConversionOutput | null => {
  const img = domNode as HTMLImageElement;
  if (img.src.startsWith('file:///') || isGoogleDocCheckboxImg(img)) return null;
  // `ImageNode` and its `$createImageNode` factory are mutually referential (the factory constructs
  // `ImageNode`; `ImageNode.importJSON` below calls the factory) — one forward reference is
  // unavoidable, same ordering as the Lexical playground's own image node.
  // oxlint-disable-next-line no-use-before-define
  const node = $createImageNode({
    altText: img.alt,
    height: readDimensionAttribute(img, 'height'),
    src: img.src,
    width: readDimensionAttribute(img, 'width'),
  });
  return { node };
};

/**
 * A rich-text image. Unlike this codebase's previous generation (which forced `width="100%"` and
 * rendered a block-level `div`, so an image could only sit at the top of the content and could
 * never be centered), this mirrors the official Lexical playground: `createDOM` returns an inline
 * `span` (`display: inline-block`, see `html-block.css`'s `.editor-image`), so the image lives
 * inside a paragraph like any other inline content and `FORMAT_ELEMENT_COMMAND` on that paragraph
 * can center/right-align it. Width/height are real numeric attributes set by `ImageResizer`, never
 * a forced percentage.
 */
export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __width: TImageDimension;
  __height: TImageDimension;
  __maxWidth: number;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__maxWidth, node.__width, node.__height, node.__key);
  }

  static importJSON(serializedNode: TSerializedImageNode): ImageNode {
    // oxlint-disable-next-line no-use-before-define -- see the comment on `$convertImageElement`'s own call above.
    return $createImageNode({
      altText: serializedNode.altText,
      height: serializedNode.height,
      maxWidth: serializedNode.maxWidth,
      src: serializedNode.src,
      width: serializedNode.width,
    }).updateFromJSON(serializedNode);
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<TSerializedImageNode>): this {
    super.updateFromJSON(serializedNode);
    this.__height = serializedNode.height ?? 'inherit';
    this.__width = serializedNode.width ?? 'inherit';
    this.__maxWidth = serializedNode.maxWidth;
    this.__src = serializedNode.src;
    this.__altText = serializedNode.altText;
    return this;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: $convertImageElement,
        priority: 0,
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('img');
    element.setAttribute('src', this.__src);
    if (this.__altText) element.setAttribute('alt', this.__altText);
    if (typeof this.__width === 'number') element.setAttribute('width', String(this.__width));
    if (typeof this.__height === 'number') element.setAttribute('height', String(this.__height));
    return { element };
  }

  constructor(
    src: string,
    altText: string,
    maxWidth: number,
    width?: TImageDimension,
    height?: TImageDimension,
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__maxWidth = maxWidth;
    this.__width = width ?? 'inherit';
    this.__height = height ?? 'inherit';
  }

  exportJSON(): TSerializedImageNode {
    const json: TSerializedImageNode = {
      ...super.exportJSON(),
      altText: this.__altText,
      maxWidth: this.__maxWidth,
      src: this.__src,
    };
    if (typeof this.__height === 'number') json.height = this.__height;
    if (typeof this.__width === 'number') json.width = this.__width;
    return json;
  }

  setWidthAndHeight(width: TImageDimension, height: TImageDimension): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  // View

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    const className = config.theme.image;
    if (className) span.className = className;
    return span;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): true {
    return true;
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  decorate(_editor: LexicalEditor): JSX.Element {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        maxWidth={this.__maxWidth}
        nodeKey={this.getKey()}
      />
    );
  }
}

export const $createImageNode = ({ altText = '', height, maxWidth = 500, src, width, key }: IImagePayload): ImageNode =>
  new ImageNode(src, altText, maxWidth, width, height, key);

export const $isImageNode = (node: unknown): node is ImageNode => node instanceof ImageNode;
