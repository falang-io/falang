import { makeObservable } from 'mobx';
import { IIconParams, IconStore } from '../../icons/base/Icon.store';
import { IIconWithList } from '../../icons/base/IIconList';
import { SingleThreadIconStore } from './SignleThreadIcon.store';
import { ThreadsStore, TVerticalAlign } from './ThreadsStore';
import { SchemeStore } from '../../store/Scheme.store';
import { IIconOutLine } from '../outs/TOutType';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconDto } from '../../icons/base/Icon.dto';

export interface IThreadsIconParams<TChildIcon extends SingleThreadIconStore = SingleThreadIconStore> extends IIconParams {
  children: TChildIcon[]
  editable: boolean
  canHaveOutlines?: boolean
  scheme: SchemeStore;
  disableOutlines?: boolean;
  gaps: number[];
  /**
   * Default: top
   */
  verticalAlign?: TVerticalAlign;
}

export class ThreadsIconStore<TChildIcon extends SingleThreadIconStore = SingleThreadIconStore> extends IconStore implements IIconWithList<TChildIcon> {
  readonly threads: ThreadsStore<TChildIcon>;

  constructor(params: IThreadsIconParams<TChildIcon>) {
    super(params);
    this.threads = new ThreadsStore({
      ...params,
      canHaveOutlines: params.canHaveOutlines === false ? false : true,
      parentId: this.id,
    });
    //makeObservable(this);
  }

  get list() {
    return this.threads;
  }

  isThreads(): boolean {
    return true;
  }

  isIconList(): boolean {
    return true;
  }

  protected getIconOutLines(): IIconOutLine[] {
    return this.threads.getIconOutLines();
  }

  createChildFromDto(dto: IconDto): TChildIcon {
    throw new Error('Cant create child');
  }
  
  dispose(): void {
    this.threads.dispose();    
    super.dispose();    
  }
}
