import { action, autorun, computed, makeObservable, observable, reaction, IReactionDisposer, runInAction } from 'mobx';
import { checker } from '../checker';
import { IconStore } from '../icons/base/Icon.store';
import { IIconList } from '../icons/base/IIconList';
import { LifegramTransformer } from '../icons/lifegram/LifeGram.transformer';
import { ParallelIconTransformer } from '../icons/parallel/Parallel.icon.transformer';
import { SwitchTransformer } from '../icons/switch/Switch.transformer';
import { SchemeStore } from './Scheme.store';

export type TValencePointType = 'in-skewer' | 'in-switch' | 'side-left';

export interface IValencePointsRegisterItem {
  id: string,
  parentId: string | null
  index: number | null
  x: number
  y: number
  type: TValencePointType
}

export type TValencePointMode = 'start' | 'skewer' | 'threads';

const VALENCE_POINT_CHECK_RADIUS = 100;
const VALENCE_POINT_RADIUS = 4;

export class ValencePointsRegistererStore {
  @observable mode: TValencePointMode = 'start';
  lastInsertedAlias = 'action';
  private lastThreadsInsertsByType: Record<string, string> = {};
  @observable vpRadius = VALENCE_POINT_RADIUS;
  private autoRunDisposer: IReactionDisposer | null = null;
  @observable private animationTimer: NodeJS.Timeout | null = null;

  dispose() {
    this.autoRunDisposer && this.autoRunDisposer();
  }

  constructor(readonly scheme: SchemeStore) {
    makeObservable(this);
    setTimeout(() => {
      this.autoRunDisposer = reaction(
        () => this.privateVisible,
        (visible) => {
          const currentVisible = visible;
          const step = currentVisible ? 1 : -1;
          if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
          }
          this.animationTimer = setInterval(() => {
            runInAction(() => {
              if ((step > 0 && this.vpRadius >= VALENCE_POINT_RADIUS) || (step < 0 && this.vpRadius <= 0)) {
                this.animationTimer && clearInterval(this.animationTimer);
                this.animationTimer = null;
                return;
              }
              this.vpRadius = this.vpRadius + step;
            });
          }, 50);
        }
      );
    });
  }

  @computed private get privateVisible() {
    const returnValue =  this.scheme.loaded
      && this.scheme.mode === 'edit'
      && (
        this.scheme.state === 'drag-icons'
        || this.scheme.state === 'start'
        || this.scheme.state === 'animation'
      );
    return returnValue;
  }

  @computed get visible(): boolean {
    const returnValue = this.scheme.state !== 'animation' && (this.privateVisible || !!this.animationTimer);
    return returnValue;
  }

  @computed get visibleValencePoints(): IValencePointsRegisterItem[] {
    if (!this.visible) return [];
    const selected = this.scheme.selection.onlySelectedIcon;
    return this.scheme.icons.valencePoints.filter((vp): boolean => {
      switch (this.mode) {
        case 'start':
          return true;
        case 'skewer':
          return vp.type === 'in-skewer'
        case 'threads':
          return vp.type === 'in-switch' && vp.parentId === this.scheme.dnd.list?.parentId;
        default:
          return false;
      }
    });
  }

  @computed.struct get selectedValencePoint(): IValencePointsRegisterItem | null {
    if (!this.privateVisible) return null;
    const x = this.mouseX;
    const y = this.mouseY;
    const strictRadius = this.mode === 'start';
    const radius = strictRadius ? 12 : VALENCE_POINT_CHECK_RADIUS;
    const boxPoints = this.visibleValencePoints.filter(point => {
      return Math.abs(point.x - x) <= VALENCE_POINT_CHECK_RADIUS
        && Math.abs(point.y - y) <= VALENCE_POINT_CHECK_RADIUS
    })
    const distances: Array<{
      pointItem: IValencePointsRegisterItem,
      distance: number,
    }> = boxPoints.map(point => {
      return {
        pointItem: point,
        distance: Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2)
      }
    });
    distances.sort((a, b) => a.distance - b.distance);
    if (distances.length) {
      if (strictRadius) {
        const nearest = distances[0].pointItem;
        const isInRadius = Math.pow(radius, 2) > distances[0].distance;
        return isInRadius ? nearest : null;
      } else {
        return distances[0].pointItem;
      }
    }
    return null;
  }
  @action onCLick() {
    const nearest = this.selectedValencePoint;
    if (!nearest || !nearest.parentId || nearest.index === null) return;
    if(this.scheme.projectStore?.onValencePointClick) {
      if(this.scheme.projectStore.onValencePointClick(nearest, this.scheme)) {
        return;
      }
    }
    const iconForInsert = this.getOnCLickIconForInsert();
    if (!iconForInsert) return;
    const parent = this.scheme.icons.get(nearest.parentId);
    if(!checker.isIconWithList(parent)) return;
    this.scheme.infrastructure.insertIcon(parent, nearest.index, iconForInsert)
    /*if (typeof iconForInsert === 'string') {
      const icon = this.scheme.createEmptyIcon(iconForInsert, nearest.parentId);
      this.scheme.dnd.animateInsertIcon(iconList, nearest.index, icon);
    } else if (iconForInsert instanceof IconStore) {
      this.scheme.dnd.animateInsertIcon(iconList, nearest.index, iconForInsert);
    }*/

    /*if (!iconForInsert) return;
    const icon = this.scheme.createEmptyIcon(iconForInsert, nearest.parentId);
    const parent = this.scheme.icons.get(nearest.parentId);
    if (!checker.isIconList(parent)) return;
    parent.splice(nearest.index, 0, [icon]);
    if (checker.isIconWithSkewer(parent)) {
      this.scheme.viewPosition.move(0, -icon.shape.height - CELL_SIZE);
      this.lastInsertedAlias = iconForInsert;
    } else if (checker.isThreads(parent)) {
      const aliasesHash = parent.childAliases.join(',');
      this.lastThreadsInsertsByType[aliasesHash] = iconForInsert;
      this.scheme.viewPosition.move(-icon.shape.width - CELL_SIZE, 0);
    }*/
  }

  private getOnCLickIconForInsert(): string | IconStore | null {
    return this.scheme.infrastructure.getOnCLickIconForInsert(this.scheme);
  }

  onContextMenu(e: React.MouseEvent<SVGGElement, MouseEvent>) {
    const nearest = this.selectedValencePoint;
    if (!nearest) return;
    const menu = this.scheme.infrastructure.getContextMenuForValencePoint(this.scheme, nearest);
    if (nearest.parentId && nearest.index !== null) {
      const parentId = nearest.parentId;
      const index = nearest.index;
      menu.unshift({
        text: this.scheme.frontRoot.lang.t('app:paste'),
        onClick: () => this.scheme.insertIconsFromClipboard(parentId, index),
      });
    }
    if (!menu.length) return;
    this.scheme.frontRoot.contextMenu.showMenu(menu, e.clientX, e.clientY);
  }

  setLastInsertedAlias(alias: string) {
    this.lastInsertedAlias = alias;
  }

  get mouseX(): number {
    return this.scheme.mousePosition.x;
  }

  get mouseY(): number {
    return this.scheme.mousePosition.y;
  }
}
