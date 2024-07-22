import { IconStore } from './Icon.store';

export const IconComponent: React.FC<{ icon: IconStore }> = ({ icon }) => {
  const Renderer = icon.scheme.getRenderer(icon);
  return <Renderer icon={icon} />;
}