import { createContext, useContext } from 'react';
import type { WorkflowStore } from './workflow-store.js';

export const WorkflowStoreContext = createContext<WorkflowStore | null>(null);

export const useWorkflowStore = (): WorkflowStore => {
  const store = useContext(WorkflowStoreContext);
  if (!store) throw new Error('useWorkflowStore must be used within a WorkflowStoreContext provider');
  return store;
};
