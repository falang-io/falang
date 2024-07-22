import { action, computed, makeObservable, observable, toJS } from 'mobx';
import { SchemeStore } from './Scheme.store';
import { EmptyIconStore } from '../icons/base/EmptyIconStore';
import { EmptyLineIconStore } from '../icons/base/EmptyLineIconStore';
import { IconStore } from '../icons/base/Icon.store';
import { IIconList, IIconWithList } from '../icons/base/IIconList';
import { checker } from '../checker';
import { EmptyBlockStore } from '../common/blocks/store/EmptyBlockStore';
import { nanoid } from 'nanoid';
import { IconWithSkewerStore } from '../common/skewer/IconWithSkewer.store';
import { TValencePointMode } from './ValencePointsRegisterer.store';
import { OutStore } from '../common/outs/Out.store';
import { SimpleIconWithSkewerStore } from '../common/skewer/SimpleIconWithSkewer.store';
import { CELL_SIZE } from '../common/constants';
import { EmptyBlockTransformer } from '../common/blocks/Block.transformer';
import { EmptyIconComponent } from '../icons/base/EmptyIcon.cmp';
import { EmptyIconTransformer } from '../icons/base/EmptyIcon.transformer';

const animationTimeout = 50;
type TAnimationType = 'back' | 'move' | 'insert';

export class DragStore {
  readonly dragSkewer: IconWithSkewerStore;
  readonly placeholder: EmptyLineIconStore;
  readonly targetPlaceholder: EmptyLineIconStore;
  @observable private totalAnimationSteps = 10;

  @observable.ref list: IIconList | null = null;
  @observable dragIconParendId: string | null = null;
  @observable private startDragX = 0;
  @observable private startDragY = 0;
  @observable private startDragMouseX = 0;
  @observable private startDragMouseY = 0;

  @observable private dragMouseX = 0;
  @observable private dragMouseY = 0;
  @observable private dragIconIndex = 0;
  @observable isDraggingPrepared: boolean = false;

  @observable private animationStep = 0;
  @observable isAnimating = false;
  @observable private animationType: TAnimationType = 'back';
  @observable opacity = 0.5;
  @observable targetOpacity = 1;
  @observable startOpacity = 0.5;  

  constructor(readonly scheme: SchemeStore) {
    const id = nanoid();
    this.dragSkewer = new SimpleIconWithSkewerStore({
      alias: 'system',
      block: new EmptyBlockStore({
        scheme: this.scheme,
      }),
      id,
      scheme: this.scheme,
      children: [],
      hideValancePoints: true,
      hideEnds: true,
      transformer: EmptyIconTransformer.getTransformer(),
    });
    this.placeholder = new EmptyLineIconStore(this.scheme);
    this.targetPlaceholder = new EmptyLineIconStore(this.scheme);
    makeObservable(this);
  }

  @computed get isDragging(): boolean {
    return this.scheme.state === 'drag-icons';
  }

  @computed get isDragSkewerVisible(): boolean {
    return this.dragSkewer.position.hasValue;
  }

  @action prepareDrag() {
    if (this.scheme.busy) return;
    if (!this.scheme.isEditing) return;
    const selectedIconsIds = this.scheme.selection.selectedIconsIds;
    if (selectedIconsIds.length === 0) {
      return
    };
    const firstIconId = selectedIconsIds[0];
    const firstIcon = this.scheme.icons.get(firstIconId);
    if (firstIcon instanceof OutStore || !firstIcon.parent) {
      return;
    };
    const parent = firstIcon.parent;
    const iconList = this.scheme.getIconListFromIcon(parent);
    if (!iconList) return;
    const dragIconIndex = iconList.iconsIds.indexOf(firstIconId);
    if (dragIconIndex === -1) return;
    this.dragIconIndex = dragIconIndex;
    this.list = iconList;
    this.dragIconParendId = firstIcon.parent.id;
    this.startDragX = firstIcon.position.x;
    this.startDragY = firstIcon.position.y - CELL_SIZE;
    this.isDraggingPrepared = true;
    this.opacity = 0.5;
  }

  @action drag(x: number, y: number) {
    if (this.scheme.busy) return;
    if (!this.isDragging) {
      if (!this.isDraggingPrepared) {
        return;
      }
      if(Math.abs(this.startDragX - x) < 7 && Math.abs(this.startDragY - y) < 7) return;
      this.startDragMouseX = x;
      this.startDragMouseY = y;
      this.startDrag();
    }
    this.dragMouseX = x;
    this.dragMouseY = y;
  }

  private startDrag() {
    //console.log('start drag');
    if (!this.scheme.isEditing || this.scheme.busy) return;
    const selectedIconsIds = this.scheme.selection.selectedIconsIds;
    if (selectedIconsIds.length === 0) return;
    if (!this.dragIconParendId || !this.list) return;
    const slicedIcons = (this.list.splice(
      this.dragIconIndex,
      selectedIconsIds.length,
      [this.placeholder],
    )).slice();
    this.scheme.state = 'drag-icons';
    this.scheme.valencePoints.mode = this.list.getType();
    this.dragSkewer.skewer.splice(0, 0, slicedIcons);
    this.isDraggingPrepared = false;
    this.placeholder.shape.setSize({
      leftSize: this.dragSkewer.shape.leftSize,
      rightSize: this.dragSkewer.shape.rightSize,
      height: this.dragSkewer.skewer.shape.height - CELL_SIZE * 2,
    });
    setTimeout(() => {
      this.placeholder.shape.setSize({
        leftSize: this.dragSkewer.shape.leftSize,
        rightSize: this.dragSkewer.shape.rightSize,
        height: this.dragSkewer.skewer.shape.height - CELL_SIZE * 2,
      });
    });


    this.dragSkewer.position.setPosition({
      x: () => this.dragMouseX - this.startDragMouseX + this.startDragX,
      y: () => this.dragMouseY - this.startDragMouseY + this.startDragY,
    });
  }

  private getModeForParent(parent: IconStore): TValencePointMode {
    if (checker.isIconWithSkewer(parent)) {
      return 'skewer';
    }
    if (checker.isThreads(parent)) {
      return 'threads';
    }
    throw new Error('Wrong parent');
  }

  private startX = 0;
  private startY = 0;

  @action stopDrag() {
  
    if (
      !this.isDragging
      || this.scheme.busy
      || !this.dragIconParendId
    ) {
      this.isDraggingPrepared = false;
      return;
    }
    const parent = this.scheme.icons.get(this.dragIconParendId);
    const nearest = this.scheme.valencePoints.selectedValencePoint;
    const isSameList = parent.id === nearest?.parentId;
    const isSameIndex = isSameList && (this.dragIconIndex === nearest?.index || this.dragIconIndex + 1 === nearest?.index);
    this.startX = this.dragSkewer.position.x;
    this.startY = this.dragSkewer.position.y;
    if (
      !nearest || !nearest.parentId || nearest.index === null || isSameIndex
    ) {
      this.animationType = 'back';
      this.targetOpacity = 1;
      this.animate();
      this.scheme.valencePoints.mode = 'start';
      return;
    }
    const newList = this.scheme.icons.get(nearest.parentId);
    const list = this.scheme.getIconListFromIcon(newList);
    if (!list) {
      throw new Error(`Should be a list: ${newList.alias}`);
    }
    list.splice(nearest.index, 0, [this.targetPlaceholder]);
    let maxAnimationLength: number;
    if(checker.isThreads(newList)) {
      const startLeftSize = this.dragSkewer.shape.leftSize;
      const startRightSize = this.dragSkewer.shape.rightSize;
      const startHeight = this.placeholder.shape.height;
      this.placeholder.shape.setSize({
        leftSize: () => Math.round(startLeftSize * (1 - (this.animationStep / this.totalAnimationSteps))),
        rightSize: () => Math.round(startRightSize * (1 - (this.animationStep / this.totalAnimationSteps))) - CELL_SIZE,
        height: startHeight,
      });
  
      this.targetPlaceholder.shape.setSize({
        leftSize: () => Math.round(startLeftSize * this.animationStep / this.totalAnimationSteps),
        rightSize: () => Math.round(startRightSize * this.animationStep / this.totalAnimationSteps)- CELL_SIZE,
        height: startHeight,
      });      
      maxAnimationLength = Math.max(
        startLeftSize,
        startRightSize
      )
    } else {
      const startLeftSize = this.dragSkewer.shape.leftSize;
      const startRightSize = this.dragSkewer.shape.rightSize;
      const startHeight = this.placeholder.shape.height + CELL_SIZE;
      this.placeholder.shape.setSize({
        leftSize: () => Math.round(startLeftSize * (1 - (this.animationStep / this.totalAnimationSteps))),
        rightSize: () => Math.round(startRightSize * (1 - (this.animationStep / this.totalAnimationSteps))),
        height: () => Math.round(startHeight * (1 - (this.animationStep / this.totalAnimationSteps))) - CELL_SIZE,
      });
  
      this.targetPlaceholder.shape.setSize({
        leftSize: () => Math.round(startLeftSize * this.animationStep / this.totalAnimationSteps),
        rightSize: () => Math.round(startRightSize * this.animationStep / this.totalAnimationSteps),
        height: () => Math.round(startHeight * this.animationStep / this.totalAnimationSteps) - CELL_SIZE,
      });
      maxAnimationLength = Math.max(
        startHeight,
        startLeftSize,
        startRightSize
      )
    }

    if (maxAnimationLength > 200) {
      this.totalAnimationSteps = 10;
    } else {
      this.totalAnimationSteps = 5;
    }
    this.targetOpacity = 1;

    this.animationType = 'move';
    this.animate();
    this.scheme.valencePoints.mode = 'start';

  }

  @action animateInsertIcon(parent: IIconList, index: number, icon: IconStore) {
    this.placeholder.shape.setSize({
      leftSize: () => Math.round(icon.shape.leftSize * this.animationStep / this.totalAnimationSteps),
      rightSize: () => Math.round(icon.shape.rightSize * this.animationStep / this.totalAnimationSteps),
      height: () => Math.round((icon.shape.height + CELL_SIZE) * this.animationStep / this.totalAnimationSteps) - CELL_SIZE,
    });
    parent.splice(index, 0, [this.placeholder]);

    this.startX = this.placeholder.position.x - 10;
    this.startY = this.placeholder.position.y + 10;
    this.dragSkewer.position.setPosition({
      x: this.startX,
      y: this.startY,
    });
    this.totalAnimationSteps = 5;
    this.dragSkewer.skewer.splice(0, 0, [icon]);
    this.animationType = 'insert';
    this.scheme.valencePoints.mode = 'start';
    this.opacity = 0;
    this.targetOpacity = 1;
    this.animate();
  }

  private animate() {
    this.animationStep = 0;
    this.startOpacity = this.opacity;
    this.isAnimating = true;
    this.scheme.state = 'animation';
    this.scheme._busy = true;
    setTimeout(() => this.runNextAnimationStep(), animationTimeout);
  }

  @action private runNextAnimationStep() {
    this.animationStep++;
    let targetX: number;
    let targetY: number;
    let startX = this.startX;
    let startY = this.startY;
    switch (this.animationType) {
      case 'back':
        targetX = this.placeholder.position.x;
        targetY = this.placeholder.position.y - CELL_SIZE;
        break;
      case 'insert':
        targetX = this.placeholder.position.x;
        targetY = this.placeholder.position.y - CELL_SIZE;
        startX = targetX - 10;
        startY = targetY + 10;
        break;
      case 'move':
        targetX = this.targetPlaceholder.position.x;
        targetY = this.targetPlaceholder.position.y - CELL_SIZE;
        break;
      default:
        throw new Error(`Wrong animation type: ${this.animationType}`);
    }
    this.dragSkewer.position.setPosition({
      x: startX + Math.round((targetX - startX) * (this.animationStep / this.totalAnimationSteps)),
      y: startY + Math.round((targetY - startY) * (this.animationStep / this.totalAnimationSteps)),
    });
    if (this.animationStep >= this.totalAnimationSteps) {
      this.finishDragAnimation();
      return;
    }
    this.opacity = this.startOpacity + (this.targetOpacity - this.startOpacity) * (this.animationStep / this.totalAnimationSteps);
    setTimeout(() => this.runNextAnimationStep(), animationTimeout);
  }

  private finishDragAnimation() {
    this.scheme._busy = false;
    this.isAnimating = false;
    const targetList = this.targetPlaceholder.parent;
    const sourceList = this.placeholder.parent;
    this.placeholder.shape.reset();
    this.placeholder.position.reset();
    this.targetPlaceholder.position.reset();
    this.targetPlaceholder.shape.reset();
    const targetIconList = this.scheme.getIconListFromIcon(targetList);
    const sourceIconList = this.scheme.getIconListFromIcon(sourceList);    
    
    if (!targetIconList || !sourceIconList) {
      if (!sourceIconList) {
        console.error({ targetList, sourceList });
        throw new Error('Wroung source and target');
      }
      const movingIcons = this.dragSkewer.skewer.splice(0, this.dragSkewer.skewer.size);
      const placeHolderIndex = sourceIconList.iconsIds.indexOf(this.placeholder.id);
      sourceIconList.splice(placeHolderIndex, 1, movingIcons);
      if (this.animationType === 'insert') {
        this.scheme.resetState();
      } else {
        if(movingIcons.length > 1) {
          this.scheme.selection.setSelectedIconsIds(movingIcons.map(icon => icon.id));
          this.scheme.state = 'selected';
        } else {
          this.scheme.selection.setSelectedIconsIds([]);
          this.scheme.state = 'start';
        }

      }
      return;
    }
    const placeHolderIndex = sourceIconList.iconsIds.indexOf(this.placeholder.id);
    const movingIcons = this.dragSkewer.skewer.splice(0, this.dragSkewer.skewer.size);
    if (placeHolderIndex === -1) {
      throw new Error('Placeholder not found');
    }

    if (this.animationType === 'back') {
      sourceIconList.splice(placeHolderIndex, 1, movingIcons);
    } else if (this.animationType === 'insert') {
      sourceIconList.splice(placeHolderIndex, 1, movingIcons);
      this.scheme.resetState();
    } else {
      sourceIconList.splice(placeHolderIndex, 1, []);
      const targetPlaceHolderIndex = targetIconList.iconsIds.indexOf(this.targetPlaceholder.id);
      if (targetPlaceHolderIndex === -1) {
        throw new Error('Target placeholder not found');
      }
      targetIconList.splice(targetPlaceHolderIndex, 1, movingIcons);
      if(movingIcons.length > 1) {
        this.scheme.selection.setSelectedIconsIds(movingIcons.map(icon => icon.id));
        this.scheme.state = 'selected';
      } else {
        this.scheme.selection.setSelectedIconsIds([]);
        this.scheme.state = 'start';
      }

      const targetId = targetIconList.parentId;
      const sourceId = sourceIconList.parentId;
      const targetIndex = toJS(targetPlaceHolderIndex);
      const sourceIndex = toJS(placeHolderIndex > targetPlaceHolderIndex ? placeHolderIndex - 1 : placeHolderIndex);
      const moveLength = toJS(movingIcons.length);
      this.scheme.onChange({
        back: () => {
          const target = this.scheme.icons.getSafe(targetId) as IIconWithList | null;
          const source = this.scheme.icons.getSafe(sourceId) as IIconWithList | null;
          if(!target || !source) return;
          const icons = target.list.splice(targetIndex, moveLength);
          source.list.splice(sourceIndex, 0, icons);
        },
        forward: () => {
          const target = this.scheme.icons.getSafe(targetId) as IIconWithList | null;
          const source = this.scheme.icons.getSafe(sourceId) as IIconWithList | null;
          if(!target || !source) return;
          const icons = source.list.splice(sourceIndex, moveLength);
          target.list.splice(targetIndex, 0, icons);
        },
      });
    }
  }
}