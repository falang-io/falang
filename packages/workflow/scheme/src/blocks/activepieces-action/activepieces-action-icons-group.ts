import { getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { NodesGroup } from '@falang/dto';
import { ACTIVEPIECES_ACTION_NAME, activepiecesActionNodesGroup } from '@falang/workflow-dto';
import { activepiecesActionBlockConfig } from './activepieces-action.block.config.js';

/** A single, generic node kind for any ActivePieces piece action — see ADR 0010 (private). */
export const buildActivepiecesActionIconsGroup = () =>
  new IconsGroup(new NodesGroup(activepiecesActionNodesGroup), {
    [ACTIVEPIECES_ACTION_NAME]: getSimpleIconNodeConfig(activepiecesActionBlockConfig, 'ActivePieces Action'),
  });
