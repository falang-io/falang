import type { INode } from '@falang/dto';
import type { TCodeLanguage } from '@falang/simple-code-dto';
import { describe, expect, it } from 'vitest';
import { generateCode } from './generate-code.js';

const n = (partial: Partial<INode> & { id: string; name: string }): INode => partial as INode;
const act = (id: string, data: string) => n({ id, name: 'action', data });

/** One tree touching every node kind: if (trueOnRight), switch with default, while (trueIsMain),
 * foreach, pseudo-cycle, break/continue/return/throw outs. Leaf text is language-neutral. */
const buildTree = (): INode =>
  n({
    id: 'root',
    name: 'code-function',
    children: [
      n({ id: 'h', name: 'code-function-header', data: 'HEADER' }),
      n({
        id: 'b',
        name: 'code-function-body',
        data: 'BODYDATA',
        children: [
          n({
            id: 'if',
            name: 'if',
            data: 'cond',
            meta: { trueOnRight: true },
            children: [
              n({ id: 'ic0', name: 'if-child', children: [act('a0', 'first();')] }),
              n({
                id: 'ic1',
                name: 'if-child',
                children: [act('a1', 'second();')],
                out: n({ id: 'r1', name: 'return', data: '' }),
              }),
            ],
          }),
          n({
            id: 'sw',
            name: 'switch',
            data: 'x',
            children: [
              n({ id: 'o1', name: 'switch-option', data: '1', children: [act('a2', 'one();')] }),
              n({
                id: 'o2',
                name: 'switch-option',
                data: 'default',
                children: [act('a3', 'other();')],
                out: n({ id: 'br', name: 'break' }),
              }),
            ],
          }),
          n({
            id: 'wh',
            name: 'while',
            data: 'i < 10',
            meta: { trueIsMain: true },
            children: [act('a4', 'step();')],
            out: n({ id: 'co', name: 'continue' }),
          }),
          n({
            id: 'fe',
            name: 'foreach',
            data: 'FOREACHHEAD',
            children: [act('a5', 'each();')],
            out: n({ id: 'ret', name: 'return', data: 'value' }),
          }),
          n({
            id: 'pc',
            name: 'pseudo-cycle',
            children: [act('a6', 'once();')],
            out: n({ id: 'th', name: 'throw', data: 'err' }),
          }),
        ],
      }),
      n({ id: 'f', name: 'code-function-footer', data: 'FOOTER' }),
    ],
  });

describe('generateCode over a tree with every node kind', () => {
  it('js', () => {
    expect(generateCode(buildTree(), 'js')).toMatchInlineSnapshot(`
      "HEADER
      {
        BODYDATA
        if (cond) {
          second();
          return;
        } else {
          first();
        }
        switch (x) {
          case 1: {
            one();
          }
          default: {
            other();
            break;
          }
        }
        while (!(i < 10)) {
          step();
          continue;
        }
        FOREACHHEAD
        {
          each();
          return value;
        }
        while (true) {
          once();
          throw err;
          break;
        }
        FOOTER
      }
      "
    `);
  });
  it('ts shares the js generator', () => {
    expect(generateCode(buildTree(), 'ts')).toBe(generateCode(buildTree(), 'js'));
  });
  it('php', () => {
    expect(generateCode(buildTree(), 'php')).toMatchInlineSnapshot(`
      "<?php
      HEADER
      {
        BODYDATA
        if (cond) {
          second();
          return;
        } else {
          first();
        }
        switch (x) {
          case 1: {
            one();
          }
          default: {
            other();
            break;
          }
        }
        while (!(i < 10)) {
          step();
          continue;
        }
        FOREACHHEAD
        {
          each();
          return value;
        }
        while (true) {
          once();
          throw err;
          break;
        }
        FOOTER
      }
      ?>
      "
    `);
  });
  it('rust', () => {
    expect(generateCode(buildTree(), 'rust')).toMatchInlineSnapshot(`
      "HEADER
      {
        BODYDATA
        if cond {
          second();
          return;
        } else {
          first();
        }
        match x {
          1 => {
            one();
          }
          _ => {
            other();
            break;
          }
        }
        while !(i < 10) {
          step();
          continue;
        }
        FOREACHHEAD
        {
          each();
          return value;
        }
        loop {
          once();
          panic!(err);
          break;
        }
        FOOTER
      }
      "
    `);
  });
  it('cpp', () => {
    expect(generateCode(buildTree(), 'cpp')).toMatchInlineSnapshot(`
      "HEADER
      {
        BODYDATA
        if (cond) {
          second();
          return;
        } else {
          first();
        }
        switch (x) {
          case 1: {
            one();
          }
          default: {
            other();
            break;
          }
        }
        while (!(i < 10)) {
          step();
          continue;
        }
        FOREACHHEAD
        {
          each();
          return value;
        }
        while (true) {
          once();
          throw err;
          break;
        }
        FOOTER
      }
      "
    `);
  });
});

describe('return without data and nodes without children', () => {
  it.each(['js', 'php', 'rust', 'cpp'] as TCodeLanguage[])('%s: bare return, empty containers', (language) => {
    const root = n({
      id: 'root',
      name: 'code-function',
      children: [
        n({ id: 'h', name: 'code-function-header', data: 'H' }),
        n({
          id: 'b',
          name: 'code-function-body',
          children: [
            n({ id: 'r', name: 'return', data: '  ' }),
            n({ id: 'if', name: 'if', data: 'c' }),
            n({ id: 'sw', name: 'switch', data: 'x' }),
          ],
        }),
        n({ id: 'f', name: 'code-function-footer', data: '' }),
      ],
    });
    const out = generateCode(root, language);
    expect(out).toContain('return;');
    expect(out).not.toContain('no generator');
  });
});
