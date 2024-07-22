import { CELL_HALF, CELL_SIZE, CELL_SIZE_2 } from '../../common/constants';
import { IIconParams, IconStore } from '../base/Icon.store';
import { LifeGramFinishIconStore } from './LifeGramFinish.icon.store';
import { LifegramFunctionIconStore } from './LifeGramFunction.icon.store';
import { ThreadsIconStore } from '../../common/threads/ThreadsIconStore';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { LifeGramFinishIconComponent } from './LifeGramFinishIcon.cmp';
import { LifeGramIconRootComponent } from './LifeGram.icon.cmp';
import { LifegramFunctionDto } from './Lifegram.dto';
import { LifegramTransformer } from './LifeGram.transformer';
import { computed, makeObservable } from 'mobx';
import { LifegramReturnIconStore } from './LifegramReturnIcon.store';
import { checker } from '../..';

export interface ILifeGramIconParams extends IIconParams {
  finish: LifeGramFinishIconStore
  functions: LifegramFunctionIconStore[]  
  header: IconStore
  gaps: number[]
}

interface ISelectOption {
  id: string
  name: string
}

export class LifeGramIconStore extends ThreadsIconStore<LifegramFunctionIconStore> {
  header: IconStore
  finish: LifeGramFinishIconStore
  readonly isLifeGramIcon = true;
  constructor(params: ILifeGramIconParams) {
    super({
      ...params,
      children: params.functions,
      editable: true,
      scheme: params.scheme,
    });
    this.finish = params.finish;
    /*this.functions = new ThreadsStore<LifegramFunctionIconStore>({
      children: params.functions,
      editable: true,
      parentId: this.id,
      scheme: params.scheme,
      canHaveOutlines: false,
    });*/
    this.header = params.header;
    this.finish.setParentId(this.id);
    this.header.setParentId(this.id);
    makeObservable(this);
  }

  /**    footer.threads.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height + this.header.shape.height + CELL_SIZE * 2 + this.skewer.shape.height,
    }); */

  initShape() {
    super.initShape();
    this.header.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.header.shape.setSize({
      leftSize: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.leftSize + CELL_SIZE : 0,
      rightSize: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.rightSize + CELL_SIZE : 0,
      height: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.height + CELL_SIZE : 0,
    });    
    this.header.block.position.setPosition({
      x: () => this.header.position.x - this.header.block.shape.leftSize,
      y: () => this.header.position.y,
    });
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y + this.header.shape.height,
    })
    this.block.resizeBarGap = CELL_SIZE;
    this.threads.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.header.shape.height + this.block.shape.height + CELL_SIZE,
    });
    this.finish.position.setPosition({
      x: () => this.position.x + this.threads.shape.rightSize + CELL_SIZE + this.finish.shape.leftSize,
      y: () => this.position.y + this.header.shape.height + this.block.shape.height + CELL_SIZE,
    });
    this.shape.setSize({
      leftSize: () => Math.max(
        this.header.shape.leftSize,
        this.threads.shape.leftSize + CELL_SIZE,
        this.block.shape.leftSize,
      ),
      rightSize: () => this.finish.position.x + this.finish.shape.rightSize - this.position.x,
      height: () => this.header.shape.height 
        + this.block.shape.height
        + CELL_SIZE
        + Math.max(
        this.finish.shape.height,
        this.threads.shape.height,
      ),
    });
    this.threads.valencePointY = () => this.position.y + this.header.shape.height + this.block.shape.height + CELL_SIZE + CELL_HALF;
    this.threads.gapControlsY = () => this.position.y + this.header.shape.height + this.block.shape.height + CELL_SIZE * 2;
  }

  updateFunctionsPositions() {

  }

  getRenderer(): TIconRenderer<any> {
    return LifeGramIconRootComponent;;
  }

  createChildFromDto(dto: LifegramFunctionDto): LifegramFunctionIconStore {
    return (this.transformer as LifegramTransformer).functionIconTransformer.fromDto(this.scheme, dto);
  }

  @computed get bottomLastX() {
    const iconsLength = this.threads.size;
    if(iconsLength === 0) return this.position.x;
    const lastIcon = this.threads.icons[iconsLength - 1];
    const footer = lastIcon.footer as ThreadsIconStore<LifegramReturnIconStore>;
    if(!footer) return lastIcon.position.x;
    const footerLength = footer.threads.size;
    if(footerLength === 0) return this.position.x;
    return footer.threads.icons[footerLength - 1].position.x;
  }

  @computed get footerSelectOptions(): ISelectOption[] {
    const root = this.scheme.root;
    if (!checker.isLifeGramStore(root)) return [];
    const returnValue: ISelectOption[] = [];
    for (const f of root.threads.icons) {
      const block = f.block;
      if (!checker.isWithText(block)) continue;
      returnValue.push({
        id: f.id,
        name: block.text.split('\n')[0],
      });
    }
    const finishBlock = root.finish.block;
    if (checker.isWithText(finishBlock)) {
      returnValue.push({
        id: root.finish.id,
        name: finishBlock.text.split('\n')[0],
      });
    }
    return returnValue;
  }
}
