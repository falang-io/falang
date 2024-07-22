import { ClassConstructor, plainToClass } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CELL_SIZE } from '../constants';
import { IInfrastructureConfig } from '../../infrastructure/IInfrastructureConfig';
import { InfrastructureType } from '../../infrastructure/InfrastructureType';
import { SchemeStore } from '../../store/Scheme.store';
import { BlockDto } from './Block.dto';
import { BlockStore } from './store/BlocksStore';
import { EmptyBlockStore } from './store/EmptyBlockStore';
import { EmptyBlockComponent } from './cmp/EmptyBlock.cmp';
import { CommonBlockBackgroundComponent } from './cmp/Common.block.bg.cmp';
import { CommonBlockEditorComponent } from './cmp/Common.block.editor.cmp';
import { CommonBlockViewComponent } from './cmp/Common.block.view.cmp';
import { IconDto } from '../../icons/base/Icon.dto';

/**
 * Блок, у которого есть фиксированный заголовок над блоком
 * dx задает смещение по горизонтали
 * (пока используется только в expression и text)
 */
export interface ITitledBlockTransformerParams {
  title?: string
  titleDx?: number
}

export interface IBlockTransformerParams<
TDto extends BlockDto = BlockDto,
TStore extends BlockStore = BlockStore,
> extends ITitledBlockTransformerParams {
  dtoConstructor: ClassConstructor<TDto>
  viewConfig?: Partial<IBlockViewConfig<TStore>>
}

export abstract class BlockTransformer<
  TDto extends BlockDto = BlockDto,
  TStore extends BlockStore = BlockStore,
  TIconDto extends IconDto = IconDto,
> {
  readonly dtoConstructor: ClassConstructor<TDto>
  readonly viewConfig: IBlockViewConfig<TStore>
  readonly title?: string
  readonly titleDx?: number

  constructor(params: IBlockTransformerParams<TDto, TStore>) { 
    this.dtoConstructor = params.dtoConstructor;
    this.viewConfig = {
      bg: params.viewConfig?.bg ?? CommonBlockBackgroundComponent,
      editor: params.viewConfig?.editor ?? CommonBlockEditorComponent,
      renderer: params.viewConfig?.renderer ?? CommonBlockViewComponent,
    } as IBlockViewConfig<TStore>;
    this.title = params.title;
    this.titleDx = params.titleDx;
  }

  async validate(value: any) {
    const instance = plainToClass(this.dtoConstructor, value);
    return await validate(instance);
  }

  abstract create(scheme: SchemeStore, id: string, iconDto?: TIconDto): TStore;
  abstract fromDto(scheme: SchemeStore, dto: TDto, id: string, iconDto?: TIconDto): TStore;
  abstract toDto(store: TStore): TDto;
  abstract updateFromDto(store: TStore, dto: TDto): void;
  isChanged(store: TStore, dto: TDto): boolean {
    const newDto = this.toDto(store);
    return deepEqual(newDto, dto);
  };
}

export class EmptyBlockTransformer extends BlockTransformer<BlockDto, BlockStore> {

  private static staticTransformer: EmptyBlockTransformer | null;

  static getTransformer(): EmptyBlockTransformer {
    if (this.staticTransformer) {
      return this.staticTransformer;
    }
    const returnValue = new EmptyBlockTransformer();
    this.staticTransformer = returnValue;
    return returnValue;
  }

  readonly text: string;

  constructor(text?: string) {
    super({
      dtoConstructor: BlockDto,
      viewConfig: {
        bg: EmptyBlockComponent,    
        editor: EmptyBlockComponent,
        renderer: EmptyBlockComponent,    
      }
    });
    this.text = text ?? '';
  }

  async validate(value: any): Promise<ValidationError[]> {
    return [];
  }

  create(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, id: string): BlockStore {
    return new EmptyBlockStore({
      text: '',
      scheme,
      id,
    });
  }

  fromDto(scheme: SchemeStore<InfrastructureType<IInfrastructureConfig>>, dto: BlockDto, id: string): BlockStore {
    return new EmptyBlockStore({
      text: '',
      scheme,
      id,
    });
  }

  toDto(store: BlockStore): BlockDto {
    return {
      width: CELL_SIZE * 4,
    }
  }

  updateFromDto(store: BlockStore, dto: BlockDto): void {
    //
  }

  isChanged(store: BlockStore, dto: BlockDto): boolean {
    return false;
  }
}

export type TBlockComponent<TBlockStore extends BlockStore = BlockStore> = React.FC<{ block: TBlockStore}>;

export interface IBlockViewConfig<TBlockStore extends BlockStore = BlockStore> {
  /**
   * Компонент в режиме просмотра
   */
  renderer: TBlockComponent<TBlockStore>
  /**
   * Компонент в режиме редактирования
   */
  editor: TBlockComponent<TBlockStore>
  /**
   * фон, который работает и в режиме просмотра, и в режиме редактирования
   * длялиний и т.п.
   */
  bg: TBlockComponent<TBlockStore>
}

const deepEqual = function (x: any, y: any) {
  if (x === y) {
    return true;
  }
  else if ((typeof x == "object" && x != null) && (typeof y == "object" && y != null)) {
    if (Object.keys(x).length != Object.keys(y).length)
      return false;

    for (var prop in x) {
      if (y.hasOwnProperty(prop))
      {  
        if (! deepEqual(x[prop], y[prop]))
          return false;
      }
      else
        return false;
    }
    
    return true;
  }
  else 
    return false;
}

/*
export interface IBlockComponentConfig {
  getEditorStore(icon: IconStore): BlockEditorStore;
  getBlockRenderer(): React.FC<{ block: any }>;
  getEditorComponentForBlock<TIcon extends IconStore>(): React.FC<{ icon: TIcon }>;
  editorBackground?: React.FC<{ block: any }>;
}
*/
/*
export interface IBlockComponentConfigParams {
  editorCtor: { new(icon: IconStore): BlockEditorStore }
  blockRenderer: React.FC<{ block: BlockStore }>
  editorRenderer: React.FC<{ icon: IconStore }>
}

export class BlockComponentConfig implements IBlockComponentConfig {
  editorCtor: { new(icon: IconStore): BlockEditorStore }
  blockRenderer: React.FC<{ block: BlockStore }>
  editorRenderer: React.FC<{ icon: IconStore }>

  constructor(params: IBlockComponentConfigParams) {
    this.editorCtor = params.editorCtor;
    this.blockRenderer = params.blockRenderer;
    this.editorRenderer = params.editorRenderer;
  }


  getEditorStore(icon: IconStore): BlockEditorStore {
    return new this.editorCtor(icon);
  }
  getBlockRenderer() {
    return this.blockRenderer;
  }

  getEditorComponentForBlock<TIcon extends unknown>(): React.FC<{ icon: TIcon; }> {
    return this.editorRenderer as React.FC<{ icon: TIcon; }>;
  }
}

*/