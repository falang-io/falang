import { describe, expect, it } from 'vitest';
import { NavigationStore } from './navigation-store.js';
import { formatAppHash, isSameProjectRoute, parseAppHash, type TAppRoute } from './navigation-url.js';

describe('navigation url', () => {
  const routes: TAppRoute[] = [
    { kind: 'projects' },
    { kind: 'runs' },
    { kind: 'tasks' },
    { kind: 'ext', key: 'billing' },
    { kind: 'template', key: 'telegram-bot-otzyvy' },
    { kind: 'project', projectId: 'p1', documentId: null, view: null },
    { kind: 'project', projectId: 'p1', documentId: 'd-2', view: null },
    { kind: 'project', projectId: 'p1', documentId: null, view: 'files' },
    { kind: 'project', projectId: 'p1', documentId: null, view: 'tasks' },
  ];

  it('round-trips every route', () => {
    for (const route of routes) expect(parseAppHash(formatAppHash(route))).toEqual(route);
  });

  it('encodes unsafe ids', () => {
    const route: TAppRoute = { kind: 'project', projectId: 'a/b', documentId: 'c d', view: null };
    expect(formatAppHash(route)).toBe('#/projects/a%2Fb/documents/c%20d');
    expect(parseAppHash(formatAppHash(route))).toEqual(route);
  });

  it('treats an empty hash as the project list', () => {
    expect(parseAppHash('')).toEqual({ kind: 'projects' });
    expect(parseAppHash('#')).toEqual({ kind: 'projects' });
    expect(parseAppHash('#/')).toEqual({ kind: 'projects' });
  });

  it('ignores hashes it does not own', () => {
    expect(parseAppHash('#/admin')).toBeNull();
    expect(parseAppHash('#/admin/users')).toBeNull();
    expect(parseAppHash('#section')).toBeNull();
    expect(parseAppHash('#/projects/p1/unknown')).toBeNull();
    expect(parseAppHash('#/projects/%E0%A4%A')).toBeNull();
  });

  it('tolerates a trailing slash', () => {
    expect(parseAppHash('#/projects/p1/')).toEqual({ kind: 'project', projectId: 'p1', documentId: null, view: null });
  });

  it('keeps the template route on the store until it is closed or a project opens', () => {
    const store = new NavigationStore();
    store.applyRoute({ kind: 'template', key: 'monitoring-sayta-telegram' });
    expect(store.view).toBe('projects');
    expect(store.route).toEqual({ kind: 'template', key: 'monitoring-sayta-telegram' });
    store.closeTemplate();
    expect(store.route).toEqual({ kind: 'projects' });

    store.openTemplate('monitoring-sayta-telegram');
    store.selectProject('p1', 'Monitoring');
    expect(store.templateKey).toBeNull();
    expect(store.route).toEqual({ kind: 'project', projectId: 'p1', documentId: null, view: null });
  });

  it('tells same-project routes apart', () => {
    expect(isSameProjectRoute(routes[5] ?? null, routes[6] ?? null)).toBe(true);
    expect(
      isSameProjectRoute(routes[4] ?? null, { kind: 'project', projectId: 'p2', documentId: null, view: null }),
    ).toBe(false);
    expect(isSameProjectRoute(routes[0] ?? null, routes[4] ?? null)).toBe(false);
  });
});
