import { observer } from 'mobx-react';
import { Text2Component } from '../../cmp/Text2.cmp';
import { LifeGramFunctionFooterBlockStore } from './LifeGramFunctionFooter.block.store';

export const LifeGramFunctionFooterBlockComponent: React.FC<{ block: LifeGramFunctionFooterBlockStore}> = observer(({ block }) => {
  return <Text2Component store={block.textStore} />;
});
