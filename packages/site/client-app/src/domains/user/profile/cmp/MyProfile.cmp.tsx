import React from 'react';
import { useRoot } from '../../../core/store/Root.context';

export const MyProfileComponent: React.FC = () => {
  const root = useRoot();
  return <>My profile</>
};
