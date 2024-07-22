import { action, makeObservable, observable, runInAction } from 'mobx';
import { CELL_SIZE } from '../../constants';
import { SchemeStore } from '../../../store/Scheme.store';
import { BlockStore } from '../store/BlocksStore';

export class IconResizerStore {
  @observable resizingBlock: BlockStore | null = null;
  @observable blockCenterX = 0;
  @observable startClientX = 0;
  @observable startWidth = 0;
  @observable blockStartX = 0;
  @observable startViewXPosition = 0;

  constructor(readonly scheme: SchemeStore) {
    makeObservable(this);
  }

  @action onMouseDown(e: React.MouseEvent<any, any>, block: BlockStore) {
    this.resizingBlock = block;
    this.startWidth = block.width;
    this.blockStartX = block.position.x;
    this.blockCenterX = block.position.x + block.shape.leftSize;
    const rect = this.scheme.getDomRect();
    const { x, scale } = this.scheme.viewPosition;
    const relativeX = (e.clientX - rect.x - x) / scale;    
    this.startClientX = relativeX;
    this.startViewXPosition = x;
    this.scheme.state = 'resize-block';
    e.stopPropagation();
    e.preventDefault();
  }

  @action onMouseUp(e: React.MouseEvent<any, any>) {
    if (!this.resizingBlock) return;
    this.resizingBlock = null;    
    e.stopPropagation();
    e.preventDefault();
    setTimeout(() => {
      runInAction(() => {
        this.scheme.state = 'selected';
      });
    }, 5);
  }

  @action onMouseMove(e: React.MouseEvent<any, any>) {
    if (!this.resizingBlock) return;
    if(e.buttons !== 1) {
      this.onMouseUp(e);
      return;
    }
    const { x, scale } = this.scheme.viewPosition;
    const rect = this.scheme.getDomRect();
    const relativeX = (e.clientX - rect.x - x) / scale;    
    //const halfWidthDiff
    let widthDiff = Math.round((relativeX - this.startClientX) / (CELL_SIZE * 2)) * CELL_SIZE * 2;
    let newWidth = Math.round(this.startWidth + widthDiff)
    newWidth = Math.min(newWidth, this.resizingBlock.maxWidth);
    newWidth = Math.max(newWidth, this.resizingBlock.minWidth);    
    widthDiff = newWidth - this.startWidth;
    this.resizingBlock.width = newWidth;
    const id = this.resizingBlock.id;
    const oldWidth = this.startWidth;    
    this.scheme.onChange({
      stackName: `blockWidth-${id}`,
      startValue: oldWidth,
      back: () => {
        const icon = this.scheme.icons.getSafe(id);
        if(!icon) {
          console.error('Icon for back not found');
          return;
        }
        icon.block.width = oldWidth;
      },
      forward: () => {
        const icon = this.scheme.icons.getSafe(id);
        if(!icon) {
          console.error('Icon for back not found');
          return;
        }
        icon.block.width = newWidth;
      }
    });
  }
}