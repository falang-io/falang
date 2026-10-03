import { NodesGroup } from '@falang/dto';
import {
  BaseIconComponent,
  type IIconStoreParams,
  getFunctionIconConfig,
  IconsGroup,
  type rectangleShape,
} from '@falang/scheme';
import { MAGIC_FUNCTION_NAME, magicFunctionNodesGroup, MAGIC_NAME, magicNodesGroup } from '@falang/workflow-dto';
import {
  magicBlockConfig,
  magicFunctionEndBlockConfig,
  magicFunctionHeaderBlockConfig,
  magicFunctionStartBlockConfig,
} from './magic-block.config.js';
import { MagicIconStore } from './magic-icon.store.js';

/**
 * A rectangle with a heavier dashed frame (theme colour via the shared `block-body` class, which also carries the
 * selected colour) so a magic block reads as "generated from text" next to ordinary solid-bordered blocks.
 */
export const magicShape: typeof rectangleShape = {
  view: ({ x, y, width, height, className }) => (
    <div
      className={className}
      data-magic-shape
      style={{ borderStyle: 'dashed', borderWidth: 2, left: x - 2, top: y - 2, width: width + 2, height: height + 2 }}
    />
  ),
};

/** `magic` in the main scheme: one block, its children are never drawn. */
export const buildMagicIconsGroup = () =>
  new IconsGroup(new NodesGroup(magicNodesGroup), {
    [MAGIC_NAME]: {
      shape: magicShape,
      block: magicBlockConfig,
      icon: { factory: (params: IIconStoreParams) => new MagicIconStore(params), view: BaseIconComponent },
    },
  });

/** The popup scheme's transient `magic-function` root: editable spell header, static Start body block, static End footer. */
export const buildMagicFunctionIconsGroup = () =>
  new IconsGroup(
    new NodesGroup(magicFunctionNodesGroup),
    getFunctionIconConfig({
      name: MAGIC_FUNCTION_NAME,
      header: magicFunctionHeaderBlockConfig,
      body: magicFunctionStartBlockConfig,
      footer: magicFunctionEndBlockConfig,
    }),
  );
