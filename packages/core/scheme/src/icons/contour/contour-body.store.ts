import { computed, makeObservable } from 'mobx';
import type { IIconWithThreadsParams } from '../../threads/icon-with-threads.store.js';
import { IconWithThreadsStore } from '../../threads/icon-with-threads.store.js';
import { CELL_HALF, CELL_SIZE_2, CELL_SIZE_3 } from '../../constants.js';
import type { ContourFunctionIconStore } from './contour-function.icon.store.js';

export class ContourBodyStore extends IconWithThreadsStore {
  constructor(params: IIconWithThreadsParams) {
    super({
      ...params,
      threads: {
        canHaveOutlines: false,
        disableOutlines: true,
      },
    });
    makeObservable(this);
  }

  get children() {
    return this.threads.icons as ContourFunctionIconStore[];
  }

  resetShape(): void {
    super.resetShape();
    this.threads.setPosition({
      x: () => this.x,
      y: () => this.y + this.blockFullHeight + CELL_SIZE_2,
    });
    this.threads.resetShape();
    this.threads.valencePointY = () => this.y + this.blockFullHeight + CELL_HALF;
  }

  @computed get left(): number {
    return Math.max(this.threads.left, this.blockFullLeft);
  }

  @computed get right(): number {
    return Math.max(this.threads.right, this.blockFullRight);
  }

  @computed get height(): number {
    return this.heightWithoutFooters + this.maxFunctionsFooterHeight + CELL_SIZE_3;
  }

  @computed get heightWithoutFooters(): number {
    const childs = this.threads.icons as ContourFunctionIconStore[];
    return Math.max(0, ...childs.map((child) => child.heightWithoutFooter));
  }

  @computed get maxFunctionsFooterHeight(): number {
    const childs = this.threads.icons as ContourFunctionIconStore[];
    return Math.max(0, ...childs.map((child) => child.footer.height));
  }
}
