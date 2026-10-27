import { NodesGroup } from '@falang/dto';
import { getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { expressionBlockConfig } from '@falang/typescript-scheme';
import { WAIT_NAME, waitNodesGroup } from '@falang/workflow-dto';

/**
 * The `wait` node (`@falang/workflow-dto`'s `waitNodesGroup`): a durable pause. The block is the shared
 * scope-aware expression editor; `title: true` draws the localised node name ("Wait") above it, like `log`.
 */
export const buildWaitIconsGroup = () =>
  new IconsGroup(new NodesGroup(waitNodesGroup), {
    [WAIT_NAME]: getSimpleIconNodeConfig(expressionBlockConfig, true),
  });
