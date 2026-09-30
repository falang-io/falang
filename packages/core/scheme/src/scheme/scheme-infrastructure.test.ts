import { action, modCfg, NodesGroup, zod } from '@falang/dto';
import { assert, describe, it } from 'vitest';
import { getSimpleIconNodeConfig } from '../icons/simple/simple.icon.config.js';
import { sideIconConfig } from '../icons/side/side.icon.config.js';
import { emptyBlockConfig } from '../utils/empty-block.js';
import { rectangleShape } from '../shapes/rectangle.js';
import { IconsGroup } from './icons-group.js';
import { SchemeInfrastructure } from './scheme-infrastructure.js';

const data = { type: zod.number(), default: () => 0 } as const;
const simple = getSimpleIconNodeConfig(emptyBlockConfig);
const modIcon = { ...simple, icon: sideIconConfig, shape: rectangleShape, mod: { placement: 'left' as const } };

describe('SchemeInfrastructure mods consistency', () => {
  it('accepts agreeing layers', () => {
    const nodes = new NodesGroup([action('host', data, { mods: ['m'] }), modCfg('m', data)]);
    assert.doesNotThrow(() => new SchemeInfrastructure([new IconsGroup(nodes, { host: simple, m: modIcon })]));
  });

  it('throws when an icon declares "mod" but no node config lists the kind', () => {
    const nodes = new NodesGroup([action('host', data), action('m', data)]);
    assert.throws(() => new SchemeInfrastructure([new IconsGroup(nodes, { host: simple, m: modIcon })]), /"m".*mod/);
  });

  it('throws when a listed mod kind has no "mod" in its icon config', () => {
    const nodes = new NodesGroup([action('host', data, { mods: ['m'] }), modCfg('m', data)]);
    assert.throws(() => new SchemeInfrastructure([new IconsGroup(nodes, { host: simple, m: simple })]), /"m"/);
  });
});
