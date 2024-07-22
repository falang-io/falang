import { checker, SchemeStore } from '@falang/editor-scheme';
import { BlockTransformer } from '@falang/editor-scheme';
import { CELL_SIZE_4 } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { LifeGramFunctionFooterBlockDto } from './LifeGramFunctionFooter.block.dto';
import { LifeGramFunctionFooterBlockStore } from './LifeGramFunctionFooter.block.store';
import { distance } from 'closest-match';
import { runInAction } from 'mobx';
import { LifeGramFunctionFooterBlockEditorComponent } from './LifeGramFunctionFooter.block.editor.cmp';
import { LifeGramFunctionFooterBlockComponent } from './LifeGramFunctionFooter.block.cmp';
import { textCheker } from '../../textChecker';

export class LifeGramFunctionFooterBlockTransformer extends BlockTransformer<
  LifeGramFunctionFooterBlockDto,
  LifeGramFunctionFooterBlockStore
> {
  constructor() {
    super({
      dtoConstructor: LifeGramFunctionFooterBlockDto,
      viewConfig: {
        editor: LifeGramFunctionFooterBlockEditorComponent,
        renderer: LifeGramFunctionFooterBlockComponent,
      },
    });
  }

  create(scheme: SchemeStore, id: string, iconDto?: IconDto | undefined): LifeGramFunctionFooterBlockStore {
    return new LifeGramFunctionFooterBlockStore({
      id,
      scheme,
      targetIcon: '',
      transformer: this,
      width: CELL_SIZE_4,
    });
  }
  fromDto(scheme: SchemeStore, dto: LifeGramFunctionFooterBlockDto, id: string, iconDto?: IconDto | undefined): LifeGramFunctionFooterBlockStore {
    const dontHaveTargetIconAndHaveText = !dto.targetIcon && !!dto.text;
    const block = new LifeGramFunctionFooterBlockStore({
      id,
      scheme,
      transformer: this,
      ...dto,
      targetIcon: dto.targetIcon ?? '',
    });
    /**
     * Временное решение для перехода от подвалов к выборным
     */
    if (dontHaveTargetIconAndHaveText) {
      setTimeout(() => {
        runInAction(() => {
          if (!dto.text) return;
          updateFromText(scheme, block, dto.text)
        });
      }, 300);
    }
    return block;
  }
  toDto(store: LifeGramFunctionFooterBlockStore): LifeGramFunctionFooterBlockDto {
    return {
      targetIcon: store.targetIcon,
      width: store.width,
    }
  }
  updateFromDto(store: LifeGramFunctionFooterBlockStore, dto: LifeGramFunctionFooterBlockDto): void {
    store.targetIcon = dto.targetIcon;
    store.width = dto.width;
  }
}

const updateFromText = (scheme: SchemeStore, block: LifeGramFunctionFooterBlockStore, dtoText: string) => {
  const root = scheme.root;
  if (!checker.isLifeGramStore(root)) return;
  let resultIcon: string | null = null;
  let closestDistance = 10000;
  for (const f of root.threads.icons) {
    const b = f.block;
    if (!textCheker.isTextBlock(b)) continue;
    const dist = distance(b.text, dtoText);
    if(dist < closestDistance) {
      resultIcon = f.id;
      closestDistance = dist;
    }
  }
  const finishBlock = root.finish.block;
  if (textCheker.isTextBlock(finishBlock)) {
    const dist = distance(finishBlock.text, dtoText);
    if(dist < closestDistance) {
      resultIcon = root.finish.id;
      closestDistance = dist;
    }
  }
  if(resultIcon) {
    block.targetIcon = resultIcon;
  }
}
