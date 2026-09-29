import { emitStatements } from '../emit-statements.js';
import { DEFAULT_CASE_VALUE, dataOf, resolveIfBranches, resolveWhileCondition } from './shared.js';
import type { ICodeGeneratorConfig } from './types.js';

export const phpGenerator: ICodeGeneratorConfig = {
  commentLinePrefix: '//',
  fileStart: '<?php',
  fileEnd: '?>',
  nodes: {
    action: ({ data, builder }) => builder.print(data),
    break: ({ builder }) => builder.print('break;'),
    continue: ({ builder }) => builder.print('continue;'),
    return: ({ data, builder }) => builder.print(data.trim() === '' ? 'return;' : `return ${data};`),
    throw: ({ data, builder }) => builder.print(`throw ${data};`),
    foreach: ({ data, builder, generateNode, node }) => {
      builder.print(data);
      builder.openQuote();
      emitStatements(node.children, generateNode, node.out);
      builder.closeQuote();
    },
    while: ({ data, builder, generateNode, node }) => {
      builder.print(`while (${resolveWhileCondition(data, node)}) {`);
      builder.indentPlus();
      emitStatements(node.children, generateNode, node.out);
      builder.closeQuote();
    },
    'pseudo-cycle': ({ builder, generateNode, node }) => {
      builder.print('while (true) {');
      builder.indentPlus();
      emitStatements(node.children, generateNode, node.out);
      builder.print('break;');
      builder.closeQuote();
    },
    if: ({ data, builder, generateNode, node }) => {
      const { thenChild, elseChild } = resolveIfBranches(node);
      builder.print(`if (${data}) {`);
      builder.indentPlus();
      emitStatements(thenChild?.children, generateNode, thenChild?.out);
      builder.indentMinus();
      builder.print('} else {');
      builder.indentPlus();
      emitStatements(elseChild?.children, generateNode, elseChild?.out);
      builder.closeQuote();
    },
    switch: ({ data, builder, generateNode, node }) => {
      builder.print(`switch (${data}) {`);
      builder.indentPlus();
      (node.children ?? []).forEach((option) => {
        const caseValue = dataOf(option);
        builder.print(caseValue.trim() === DEFAULT_CASE_VALUE ? 'default: {' : `case ${caseValue}: {`);
        builder.indentPlus();
        emitStatements(option.children, generateNode, option.out);
        builder.closeQuote();
      });
      builder.closeQuote();
    },
    function: ({ builder, generateNode, node }) => {
      const [header, body, footer] = node.children ?? [];
      builder.print(dataOf(header));
      builder.openQuote();
      const bodyData = dataOf(body);
      if (bodyData !== '') builder.print(bodyData);
      emitStatements(body?.children, generateNode);
      builder.print(dataOf(footer));
      builder.closeQuote();
    },
  },
};
