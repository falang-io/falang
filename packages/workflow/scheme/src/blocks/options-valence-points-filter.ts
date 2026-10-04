import { resolveService } from '@falang/di';
import {
  DEFAULT_MODES,
  ICONS_DRAGGING_MODE_NAME,
  TOKEN_VALENCE_POINTS,
  type IValencePoint,
  type Scheme,
} from '@falang/scheme';
import type { IntegrationsRegistryStore } from '../registry/integrations-registry.store.js';

const FILTER_ALIAS = 'workflow-options-valence-points';
const NOOP = (): void => {
  // no valence points in this scheme — nothing to remove
};

/** Whether icons are being moved — the click-based transfer mode or a drag in progress. */
const isMovingIcons = (scheme: Scheme): boolean =>
  scheme.mode.value === DEFAULT_MODES.TRANSFER || scheme.mode.value === ICONS_DRAGGING_MODE_NAME;

/**
 * Question/choice nodes (`telegram-question`, `call-ai-choice`, …) take their branches from the
 * `options` list edited in the header block — the editor rewrites the `<name>-option` children from
 * it on every save, so an option inserted through a branch valence point would vanish on the next
 * edit. Their `in-switch` valence points are therefore hidden, except while icons are moved (reordering
 * options by drag/transfer is supported, see `sync-options-on-move.ts`).
 */
export const filterOptionsValencePoints = (
  points: IValencePoint[],
  scheme: Scheme,
  registry: IntegrationsRegistryStore,
): IValencePoint[] => {
  if (isMovingIcons(scheme)) return points;
  return points.filter((vp) => {
    if (vp.type !== 'in-switch') return true;
    const parent = scheme.nodes.getNodeSafe(vp.parentId);
    if (!parent) return true;
    return !registry.findQuestion(parent.name) && !registry.findChoice(parent.name);
  });
};

/** Installs `filterOptionsValencePoints` when the scheme has valence points at all. Returns the disposer. */
export const registerOptionsValencePointsFilter = (
  scheme: Scheme,
  registry: IntegrationsRegistryStore,
): (() => void) => {
  if (!scheme.container.isRegistered(TOKEN_VALENCE_POINTS, true)) return NOOP;
  const service = resolveService(TOKEN_VALENCE_POINTS, scheme.container);
  service.addValencePointsFilter(FILTER_ALIAS, (points) => filterOptionsValencePoints(points, scheme, registry));
  return () => service.removeValencePointsFilter(FILTER_ALIAS);
};
