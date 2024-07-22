import { getActionIconConfig } from '@falang/editor-scheme';
import { IconDto } from '@falang/editor-scheme';
import { getForEachConfig } from '@falang/editor-scheme';
import { getFunctionIconConfig } from '@falang/editor-scheme';
import { getIfIconConfig } from '@falang/editor-scheme';
import { getLifegramConfig } from '@falang/editor-scheme';
import { getParallelIconConfig } from '@falang/editor-scheme';
import { getPseudoCycleConfig } from '@falang/editor-scheme';
import { TimerSideIconTransformer } from '@falang/editor-scheme';
import { getSwitchIconConfig } from '@falang/editor-scheme';
import { getWhileConfig } from '@falang/editor-scheme';
import { OutDto } from '@falang/editor-scheme';
import { OutTransformer } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { LinkBlockTransformer } from './blocks/link/LinkBlock.transformer';
import { TextBlockTransformer } from './blocks/text/TextBlock.transformer';
import { CELL_SIZE } from '@falang/editor-scheme';
import { getOutputIconConfig } from '@falang/editor-scheme';
import { getInputIconConfig } from '@falang/editor-scheme';
import { RackTextBlockTransformer } from './blocks/rack-text/RackText.block.transformer';
import { getMindTreeRootIconConfig } from '@falang/editor-scheme';
import { LifeGramFunctionFooterBlockTransformer } from './blocks/lifegram-function-footer-block/LifeGramFunctionFooter.block.transformer';

export const getTextInfrastructureConfig = (): IInfrastructureConfig => {
  const blockTransformer = new TextBlockTransformer();
  const outTransformer = new OutTransformer({
    alias: 'system',
    returnBlockTransformer: blockTransformer,
    dtoConstructor: OutDto,
  });
  const leftSideTransformer = new TimerSideIconTransformer({
    alias: 'system',
    blockTransformer,
    dtoConstructor: IconDto,
  });
  const linkBlockTransformer = new LinkBlockTransformer();
  const outputBlockTransformer = new TextBlockTransformer({
    title: 'base:output',
    titleDx: CELL_SIZE,
  });
  const inputBlockTransformer = new TextBlockTransformer({
    title: 'base:input',
    titleDx: -CELL_SIZE,
  });
  const rackTextBlockTransformer = new RackTextBlockTransformer();

  const lifegramFooterTransformer = new LifeGramFunctionFooterBlockTransformer();

  return {
    name: 'text',
    icons: {
      action: getActionIconConfig({ blockTransformer, leftSideTransformer }),
      function: getFunctionIconConfig({ blockTransformer }),
      if: getIfIconConfig({ blockTransformer, outTransformer, leftSideTransformer }),
      switch: getSwitchIconConfig({ blockTransformer, outTransformer, leftSideTransformer }),
      while: getWhileConfig({ blockTransformer }),
      foreach: getForEachConfig({ blockTransformer }),
      parallel: getParallelIconConfig({}),
      'pseudo-cycle': getPseudoCycleConfig({}),
      'lifegram': getLifegramConfig({ 
        blockTransformer,
        returnBlockTransformer: lifegramFooterTransformer,
      }),
      link: getActionIconConfig({ blockTransformer: linkBlockTransformer, leftSideTransformer, alias: 'link' }),
      output: getOutputIconConfig({ 
        blockTransformer: outputBlockTransformer,
      }),
      input: getInputIconConfig({ 
        blockTransformer: inputBlockTransformer,
      }),
      rack: getActionIconConfig({
        alias: 'rack',
        blockTransformer: rackTextBlockTransformer,
      }),
      tree: getMindTreeRootIconConfig({
        alias: 'tree',
        blockTransformer,
        childBlockTransformer: blockTransformer,
        headerBlockTransformer: blockTransformer,
        threadBlockTransformer: blockTransformer,
        allowChild: true,
      })
    },
    skewerIcons: [
      "action",
      'if',
      'switch',
      'while',
      'foreach',
      'parallel',
      'pseudo-cycle',
      'link',
      'output',
      'input',
      'rack',
    ],
    outs: outTransformer,
    type: 'scheme',
  }
}
