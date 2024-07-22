import { TextBlockStore } from './blocks/text/TextBlockStore';

export const textCheker = {
  isTextBlock(value?: any): value is TextBlockStore {
    return value && !!value.isTextBlock;
   }, 
} as const;