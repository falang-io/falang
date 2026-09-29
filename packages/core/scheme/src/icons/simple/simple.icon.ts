import { computed, makeObservable } from 'mobx';
import { IconStore } from '../../store/icon.store.js';

export class SimpleIconStore extends IconStore {
  constructor(...args: ConstructorParameters<typeof IconStore>) {
    super(...args);
    makeObservable(this);
  }

  @computed get left(): number {
    return this.blockFullLeft;
  }
  @computed get right(): number {
    return this.blockFullRight;
  }
  @computed get height(): number {
    return this.blockFullHeight;
  }
}
