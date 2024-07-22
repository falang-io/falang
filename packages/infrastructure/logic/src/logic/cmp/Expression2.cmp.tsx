import { BlockStore } from '@falang/editor-scheme';
import { Expression2Store } from '../expression/Expression2.store';

export const Expression2ViewComponent: React.FC<{ store: Expression2Store }> = ({ store }) => {
  const Renderer = store.codeStore.getRenderer();
  return <Renderer store={store.codeStore} />
};

export const Expression2EditorComponent: React.FC<{ store: Expression2Store, blockStore?: BlockStore }> = ({ store, blockStore }) => {
  const Renderer = store.codeStore.getEditor();
  return <Renderer store={store.codeStore} blockStore={blockStore} />
};

export const Expression2BackgroundComponent: React.FC<{ store: Expression2Store }> = ({ store }) => {
  const Renderer = store.codeStore.getBackground();
  return <Renderer store={store.codeStore} />
};
