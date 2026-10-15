import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { generateCode } from './generate-code.js';

const n = (partial: Partial<INode> & { id: string; name: string }): INode => partial as INode;
const act = (id: string, data: string) => n({ id, name: 'action', data });

describe('generated JS is syntactically valid', () => {
  it('passes node --check', () => {
    const tree = n({
      id: 'root',
      name: 'code-function',
      children: [
        n({ id: 'h', name: 'code-function-header', data: 'function f(x, i, items)' }),
        n({
          id: 'b',
          name: 'code-function-body',
          children: [
            n({
              id: 'if',
              name: 'if',
              data: 'x > 0',
              meta: { trueOnRight: true },
              children: [
                n({ id: 'c0', name: 'if-child', children: [act('a0', 'x++;')] }),
                n({ id: 'c1', name: 'if-child', children: [], out: n({ id: 'r', name: 'return', data: '1' }) }),
              ],
            }),
            n({
              id: 'sw',
              name: 'switch',
              data: 'x',
              children: [
                n({
                  id: 'o1',
                  name: 'switch-option',
                  data: '1',
                  children: [act('a1', 'x--;')],
                  out: n({ id: 'b1', name: 'break' }),
                }),
                n({ id: 'o2', name: 'switch-option', data: 'default', children: [act('a2', 'x = 0;')] }),
              ],
            }),
            n({
              id: 'wh',
              name: 'while',
              data: 'i < 10',
              meta: { trueIsMain: true },
              children: [act('a3', 'i++;')],
              out: n({ id: 'b2', name: 'break' }),
            }),
            n({
              id: 'fe',
              name: 'foreach',
              data: 'for (const it of items)',
              children: [act('a4', 'x += it;')],
              out: n({ id: 'c2', name: 'continue' }),
            }),
            n({
              id: 'pc',
              name: 'pseudo-cycle',
              children: [act('a5', 'x++;')],
              out: n({ id: 't', name: 'throw', data: 'new Error("e")' }),
            }),
          ],
        }),
        n({ id: 'f', name: 'code-function-footer', data: '' }),
      ],
    });
    const dir = mkdtempSync(join(tmpdir(), 'gen-js-'));
    try {
      const file = join(dir, 'out.js');
      writeFileSync(file, generateCode(tree, 'js'));
      expect(() => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const hasPhp = spawnSync('php', ['--version']).status === 0;

describe('generated PHP is syntactically valid', () => {
  it.skipIf(!hasPhp)('passes php -l', () => {
    const tree = n({
      id: 'root',
      name: 'code-function',
      children: [
        n({ id: 'h', name: 'code-function-header', data: 'function f($x)' }),
        n({ id: 'b', name: 'code-function-body', children: [act('a', '$x++;')] }),
        n({ id: 'f', name: 'code-function-footer', data: '' }),
      ],
    });
    const dir = mkdtempSync(join(tmpdir(), 'gen-php-'));
    try {
      const file = join(dir, 'out.php');
      writeFileSync(file, generateCode(tree, 'php'));
      expect(() => execFileSync('php', ['-l', file], { stdio: 'pipe' })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
