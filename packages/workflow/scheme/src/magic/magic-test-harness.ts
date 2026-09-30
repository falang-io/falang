import {
  action,
  cycle,
  functionCfg,
  getOutConfigSimple,
  ifCfg,
  NodesGroup,
  switchCfg,
  zod,
  type IDataInfo,
} from '@falang/dto';
import {
  emptyBlockConfig,
  getFunctionIconConfig,
  getIfIconConfig,
  getWhileIconNodeConfig,
  IconsGroup,
  outIconConfig,
  rectangleShape,
  simpleIconConfig,
  SchemeInfrastructure,
} from '@falang/scheme';

const stringType = { type: zod.string(), default: () => '' } as const satisfies IDataInfo;
const numberType = { type: zod.number(), default: () => 0 } as const satisfies IDataInfo;

/** A minimal function-shaped node/icon infrastructure (plain `action`s in a `function-body`) for the magic tests. */
export const getMagicTestIconsGroup = () => {
  const nodes = new NodesGroup([
    action('action', stringType),
    getOutConfigSimple('out', 'return'),
    cycle('cycle', numberType),
    ...switchCfg({ name: 'switch', data: numberType, optionData: numberType }),
    ...functionCfg({ name: 'function', data: stringType, footer: stringType, header: stringType }),
    ...ifCfg('if', stringType),
    cycle('while', stringType),
  ]);
  const common = { block: { view: () => null }, icon: simpleIconConfig, shape: rectangleShape };
  return new IconsGroup(nodes, {
    ...getFunctionIconConfig({
      name: 'function',
      header: emptyBlockConfig,
      body: emptyBlockConfig,
      footer: emptyBlockConfig,
    }),
    'switch-option': common,
    action: common,
    cycle: common,
    ...getIfIconConfig({ name: 'if', block: emptyBlockConfig }),
    out: { ...common, icon: outIconConfig },
    switch: common,
    while: getWhileIconNodeConfig({ block: emptyBlockConfig }),
  });
};

export const getMagicTestInfrastructure = (...extra: IconsGroup[]) =>
  new SchemeInfrastructure([getMagicTestIconsGroup(), ...extra]);
