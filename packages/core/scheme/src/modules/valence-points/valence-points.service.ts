import { action, computed, makeObservable, observable, ObservableMap } from 'mobx';
import type { Scheme } from '../../scheme/scheme.js';
import type { IIconWithList } from '../../types/icon-list.js';
import { checker } from '../../checker.js';
import type { IValencePoint } from '../../types/valence-point-item.js';
import { VALENCE_POINT_CHECK_RADIUS } from './constants.js';

export type IValencePointsFilter = (vp: IValencePoint[]) => IValencePoint[];

export class ValencePointsService {
  readonly scheme: Scheme;

  @observable private isVisible = true;
  private readonly filters = new ObservableMap<string, IValencePointsFilter>();

  constructor(scheme: Scheme) {
    this.scheme = scheme;
    makeObservable(this);
  }

  @computed get visible() {
    return this.scheme.isEditing && this.isVisible;
  }

  @computed get visibleValencePoints(): IValencePoint[] {
    if (!this.visible) return [];
    let returnValue = this.allValencePoints;
    this.filters.forEach((f) => {
      returnValue = f(returnValue);
    });
    return returnValue;
  }

  @computed get selectedValencePoint(): IValencePoint | null {
    const x = this.scheme.mousePosition.x;
    const y = this.scheme.mousePosition.y;
    const radius = VALENCE_POINT_CHECK_RADIUS;
    const boxPoints = this.visibleValencePoints.filter(
      (point) => Math.abs(point.x - x) <= radius && Math.abs(point.y - y) <= radius,
    );
    const distances: {
      pointItem: IValencePoint;
      distance: number;
    }[] = Array.from(
      boxPoints.map((point) => ({
        pointItem: point,
        distance: (point.x - x) ** 2 + (point.y - y) ** 2,
      })),
    );
    distances.sort((a, b) => a.distance - b.distance);
    if (distances.length > 0) {
      const nearest = distances[0].pointItem;
      const isInRadius = radius ** 2 > distances[0].distance;
      return isInRadius ? nearest : null;
    }
    return null;
  }

  @computed get allValencePoints(): IValencePoint[] {
    return this.lists.flatMap((list) => list.list.valencePoints);
  }

  @computed private get lists(): IIconWithList[] {
    return this.scheme.icons.all.filter((icon) => checker.isWithList(icon));
  }

  @action setIsVisible(visible: boolean) {
    this.isVisible = visible;
  }

  @action addValencePointsFilter(alias: string, filter: IValencePointsFilter) {
    this.filters.set(alias, filter);
  }

  @action removeValencePointsFilter(alias: string) {
    this.filters.delete(alias);
  }
}
