import { observer } from 'mobx-react';
import { Text2Component } from '../../cmp/Text2.cmp';
import { TextBlockStore } from './TextBlockStore';

export const TextBlockComponent: React.FC<{ block: TextBlockStore }> = observer(({ block }) => {
  return <Text2Component store={block.textStore} />
});