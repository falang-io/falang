import { BlockStore, IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE, CELL_SIZE_2, FONT_SIZE, FONT_SIZE_HALF } from '@falang/editor-scheme';
import { IBlockBadge } from '@falang/editor-scheme';
import { IBlockLine } from '@falang/editor-scheme';
import { getTextWidth } from '@falang/editor-scheme';
import { SchemeHeaderBlockDto } from './SchemeHeader.block.dto';

export interface ISchemeHeaderBlockStoreParams extends IBlockStoreParams, SchemeHeaderBlockDto {
  titleLang: string
}

export class SchemeHeaderBlockStore extends BlockStore {
  readonly titleLang: string;
  constructor(params: ISchemeHeaderBlockStoreParams) {
    super({
      ...params,
      editable: false,
    });
    this.titleLang = params.titleLang;
  }

  protected initShape(): void {
    super.initShape();
    this.shape.setHeight(CELL_SIZE * 3);
  }

  get text() {
    return this.scheme.name;
  }

  get textWidth() {
    return getTextWidth(this.text);
  }

  getBlockBadges(): IBlockBadge[] {
    const t = this.scheme.frontRoot.lang.t;
    return [{
      dx: this.shape.halfWidth - Math.round(this.textWidth / 2),
      dy: CELL_SIZE_2 - FONT_SIZE_HALF - 4,
      text: this.text,
    }, {
      dx: 0,
      dy: 0,
      text: t(this.titleLang),
    }];
  }

  getBlockLines(): IBlockLine[] | null {
    return [{
      dx1: -CELL_SIZE,
      dx2: this.shape.width + CELL_SIZE,
      dy1: CELL_SIZE,
      dy2: CELL_SIZE,
    }];
  }
}