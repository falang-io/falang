import { BUNDLED_DRIVERS_DIR } from '@falang/desktop-arduino-drivers';
import { loadDriverRegistryFromDirs, type IDriverConfig } from '@falang/desktop-arduino-dto';
import type { INode, IProjectDocument } from '@falang/dto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { compileArduinoProject } from './compile-arduino-project.js';

// Real ts.Program type-check; the package has no own vitest config, so the default timeout would flake under a full run.
vi.setConfig({ testTimeout: 20_000 });

const functionDocument = (id: string, name: string, body: INode[]): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root: {
    id,
    name: 'function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: body },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

const intVar = (id: string, name: string, value: string): INode => ({
  id,
  name: 'create-var',
  data: { name, variableType: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } }, value },
});

const printAt = (id: string, driverId: string, col: string): INode => ({
  id,
  name: `driver-action::${driverId}::print-text`,
  data: { col, row: '0', text: 'Hello' },
});

describe('compileArduinoProject — number-expression driver fields (bundled LCD1602 drivers)', () => {
  let drivers: IDriverConfig[] = [];
  beforeAll(async () => {
    const registry = await loadDriverRegistryFromDirs([BUNDLED_DRIVERS_DIR]);
    drivers = registry.drivers.map((driver) => driver.config);
  });

  it.each(['lcd1602-i2c', 'lcd1602-parallel'])('%s: the column can be a variable (scrolling text)', (driverId) => {
    const { code } = compileArduinoProject({
      documents: [
        functionDocument('setup', 'setup', []),
        functionDocument('loop', 'loop', [intVar('v', 'pos', '3'), printAt('p', driverId, 'pos + 1')]),
      ],
      drivers,
    });
    expect(code).toMatch(/print_text\(\(?pos \+ 1\)?, 0, /);
  });

  it('a stored literal column (existing projects) still compiles to the literal', () => {
    const { code } = compileArduinoProject({
      documents: [
        functionDocument('setup', 'setup', []),
        functionDocument('loop', 'loop', [printAt('p', 'lcd1602-i2c', '5')]),
      ],
      drivers,
    });
    expect(code).toContain('lcd_print_text(5, 0, ');
  });

  it('a negative literal column reaches the driver as is (the driver clips the text on the left)', () => {
    const { code } = compileArduinoProject({
      documents: [
        functionDocument('setup', 'setup', []),
        functionDocument('loop', 'loop', [printAt('p', 'lcd1602-parallel', '-1')]),
      ],
      drivers,
    });
    expect(code).toContain('lcd_parallel_print_text(-1, 0, ');
  });

  it('a column of the wrong type is a compile error', () => {
    expect(() =>
      compileArduinoProject({
        documents: [
          functionDocument('setup', 'setup', []),
          functionDocument('loop', 'loop', [printAt('p', 'lcd1602-i2c', '"left"')]),
        ],
        drivers,
      }),
    ).toThrow();
  });
});
