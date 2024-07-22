import { BlockStore } from '../store/BlocksStore';

export const BlockComponent: React.FC<{ block: BlockStore }> = ({ block }) => {
  const ShadowRenderer = block.viewConfig.bg;
  const Renderer = block.viewConfig.renderer;
  if (block.scheme.editing.isIconEditing && block.scheme.editing.editingIcon?.id === block.id) {
    return ShadowRenderer ? <ShadowRenderer block={block} /> : null;
  };  
  return <>{ShadowRenderer ? <ShadowRenderer block={block} /> : null}<Renderer block={block} /></>;
}