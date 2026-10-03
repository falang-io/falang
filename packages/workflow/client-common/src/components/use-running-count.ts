import { useEffect, useState } from 'react';
import { workflowApi } from '../api-client.js';

/** How often the toolbar re-counts this project's open executions for the Runs badge — coarse on purpose, the drawer refreshes itself when opened. */
const RUNNING_COUNT_POLL_MS = 15_000;

/** How many of the project's executions are open right now — refreshed immediately when the watched run's status changes, otherwise a slow poll. */
export const useRunningCount = (projectId: string, watchedStatus: string | null): number => {
  const [runningCount, setRunningCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      workflowApi
        .listWorkflowRuns({ projectId })
        .then((runs) => {
          if (!cancelled) setRunningCount(runs.filter((run) => run.status === 'RUNNING').length);
        })
        .catch(() => null);
    };
    refresh();
    const timer = setInterval(refresh, RUNNING_COUNT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, watchedStatus]);
  return runningCount;
};
