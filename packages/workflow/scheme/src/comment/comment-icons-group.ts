import { COMMENT_NAME, commentCfg, NodesGroup, type INodeConfig } from '@falang/dto';
import { commentShape, getSimpleIconNodeConfig, IconsGroup } from '@falang/scheme';
import { textBlockConfig } from '@falang/typescript-scheme';

/** The comment node (`@falang/dto`'s `commentCfg`): plain text on a sheet with a folded corner. */
export const buildCommentIconsGroup = () => {
  const nodes: readonly INodeConfig[] = [commentCfg()];
  return new IconsGroup(new NodesGroup(nodes), {
    [COMMENT_NAME]: { ...getSimpleIconNodeConfig(textBlockConfig), shape: commentShape },
  });
};
