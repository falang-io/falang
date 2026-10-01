import { getTestNodesConfig } from './get-test-nodes-config.js';
import { SchemeInfrastructure } from '../src/scheme/scheme-infrastructure.js';
import { simpleIconConfig } from '../src/icons/simple/simple.icon.config.js';
import { outIconConfig } from '../src/icons/out/out.icon.config.js';
import { rectangleShape } from '../src/shapes/rectangle.js';

import {
  emptyBlockConfig,
  getFunctionIconConfig,
  getIfIconConfig,
  getWhileIconNodeConfig,
  IconsGroup,
  sideIconConfig,
  timerShape,
} from '../src/index.js';

export const getTestInfrastructure = () => {
  const config = getTestNodesConfig();
  const commonIconConfig = {
    block: {
      view: () => null,
    },
    icon: simpleIconConfig,
    shape: rectangleShape,
  };
  const outNodeIconConfig = {
    ...commonIconConfig,
    icon: outIconConfig,
  };
  const iconsGroup = new IconsGroup(config, {
    ...getFunctionIconConfig({
      name: 'function',
      header: emptyBlockConfig,
      body: emptyBlockConfig,
      footer: emptyBlockConfig,
    }),
    'switch-option': commonIconConfig,
    action: commonIconConfig,
    action2: commonIconConfig,
    action3: commonIconConfig,
    cycle: commonIconConfig,
    ...getIfIconConfig({
      name: 'if',
      block: emptyBlockConfig,
    }),
    mod1: { ...commonIconConfig, icon: sideIconConfig, shape: timerShape, mod: { placement: 'left' as const } },
    out: outNodeIconConfig,
    'out-break': outNodeIconConfig,
    switch: commonIconConfig,
    while: getWhileIconNodeConfig({ block: emptyBlockConfig }),
  });
  return new SchemeInfrastructure([iconsGroup]);
};
