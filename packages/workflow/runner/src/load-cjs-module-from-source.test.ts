import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCjsModuleFromSource } from './load-cjs-module-from-source.js';

describe('loadCjsModuleFromSource', () => {
  it('evaluates plain CommonJS source and returns its exports', () => {
    const exports = loadCjsModuleFromSource(
      'exports.greet = function (name) { return "hi " + name; };',
      // oxlint-disable-next-line unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
      join(__dirname, '__fixture__.js'),
    ) as { greet(name: string): string };

    expect(exports.greet('world')).toBe('hi world');
  });

  it("resolves require() against the given filename's node_modules, same as a real file there would", () => {
    const exports = loadCjsModuleFromSource(
      "var activity = require('@temporalio/activity'); exports.hasLog = typeof activity.log === 'object';",
      // oxlint-disable-next-line unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
      join(__dirname, '__fixture__.js'),
    ) as { hasLog: boolean };

    expect(exports.hasLog).toBe(true);
  });
});
