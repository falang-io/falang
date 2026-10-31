import path from 'node:path';

/** Everything the local mode persists (`db/`, `files/`, `temporal/`, `bin/`, `secrets.json`) lives here. */
export const resolveDataDir = (userDataPath: string): string => path.join(userDataPath, 'flow');
