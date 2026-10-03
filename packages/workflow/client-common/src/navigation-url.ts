/** Which project-level main view a project route points at instead of a document. */
export type TProjectRouteView = 'files' | 'tasks';

/** Where the app is, as far as the URL hash can say: the whole of the navigation state, serialized. */
export type TAppRoute =
  | { kind: 'projects' }
  | { kind: 'runs' }
  | { kind: 'tasks' }
  | { kind: 'ext'; key: string }
  | { kind: 'project'; projectId: string; documentId: string | null; view: TProjectRouteView | null };

const safeDecode = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

const parseProjectSegments = (segments: readonly string[]): TAppRoute | null => {
  const projectId = safeDecode(segments[1] ?? '');
  if (!projectId) return null;
  const third = segments[2];
  const fourth = segments[3];
  if (segments.length === 2) return { kind: 'project', projectId, documentId: null, view: null };
  if (segments.length === 3 && (third === 'files' || third === 'tasks')) {
    return { kind: 'project', projectId, documentId: null, view: third };
  }
  if (segments.length === 4 && third === 'documents') {
    const documentId = safeDecode(fourth ?? '');
    return documentId ? { kind: 'project', projectId, documentId, view: null } : null;
  }
  return null;
};

/**
 * Parses `location.hash` (`#/projects/<id>/documents/<docId>`, `#/projects/<id>/files|tasks`,
 * `#/runs`, `#/tasks`, `#/ext/<key>`, empty / `#/` = the project list). Returns `null` for a hash this
 * router doesn't own (`#/admin…`, plain anchors, garbage) so the caller leaves the current state alone.
 */
export const parseAppHash = (hash: string): TAppRoute | null => {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { kind: 'projects' };
  if (!path.startsWith('/')) return null;
  const segments = path.split('/').filter((segment) => segment !== '');
  switch (segments[0]) {
    case 'projects': {
      return segments.length === 1 ? { kind: 'projects' } : parseProjectSegments(segments);
    }
    case 'runs': {
      return segments.length === 1 ? { kind: 'runs' } : null;
    }
    case 'tasks': {
      return segments.length === 1 ? { kind: 'tasks' } : null;
    }
    case 'ext': {
      const key = safeDecode(segments[1] ?? '');
      return key && segments.length === 2 ? { kind: 'ext', key } : null;
    }
    default: {
      return null;
    }
  }
};

/** Inverse of `parseAppHash`; the project list is the bare `#/`. */
export const formatAppHash = (route: TAppRoute): string => {
  switch (route.kind) {
    case 'projects': {
      return '#/';
    }
    case 'runs': {
      return '#/runs';
    }
    case 'tasks': {
      return '#/tasks';
    }
    case 'ext': {
      return `#/ext/${encodeURIComponent(route.key)}`;
    }
    case 'project': {
      const base = `#/projects/${encodeURIComponent(route.projectId)}`;
      if (route.view) return `${base}/${route.view}`;
      return route.documentId ? `${base}/documents/${encodeURIComponent(route.documentId)}` : base;
    }
    default: {
      return '#/';
    }
  }
};

export const isSameProjectRoute = (a: TAppRoute | null, b: TAppRoute | null): boolean =>
  a?.kind === 'project' && b?.kind === 'project' && a.projectId === b.projectId;
