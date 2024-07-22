
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { EmptyIconStore } from './EmptyIconStore';

export const EmptyIconComponent: TIconRenderer<EmptyIconStore> = () => {
  return <></>;
};
