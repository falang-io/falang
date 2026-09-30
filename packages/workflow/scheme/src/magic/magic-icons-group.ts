import { NodesGroup } from '@falang/dto';
import {
  BaseIconComponent,
  type IIconStoreParams,
  getFunctionIconConfig,
  IconsGroup,
  rectangleShape,
} from '@falang/scheme';
import { MAGIC_FUNCTION_NAME, magicFunctionNodesGroup, MAGIC_NAME, magicNodesGroup } from '@falang/workflow-dto';
import {
  magicBlockConfig,
  magicFunctionEndBlockConfig,
  magicFunctionHeaderBlockConfig,
  magicFunctionStartBlockConfig,
} from './magic-block.config.js';
import { MagicIconStore } from './magic-icon.store.js';

/** `magic` in the main scheme: one block, its children are never drawn. */
export const buildMagicIconsGroup = () =>
  new IconsGroup(new NodesGroup(magicNodesGroup), {
    [MAGIC_NAME]: {
      shape: rectangleShape,
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
