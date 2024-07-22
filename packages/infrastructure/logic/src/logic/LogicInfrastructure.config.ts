import { getActionIconConfig } from '@falang/editor-scheme';
import { getFunctionIconConfig } from '@falang/editor-scheme';
import { OutDto } from '@falang/editor-scheme';
import { OutTransformer } from '@falang/editor-scheme';
import { IInfrastructureConfig } from '@falang/editor-scheme';
import { ExpressionBlockTransformer } from './blocks/expression/Expression.block.transformer';
import { getIfIconConfig } from '@falang/editor-scheme';
import { ForeachHeaderBlockTransformer } from './blocks/foreach-header/ForeachHeader.block.transformer';
import { getForEachConfig } from '@falang/editor-scheme';
import { getWhileConfig } from '@falang/editor-scheme';
import { getPseudoCycleConfig } from '@falang/editor-scheme';
import { getParallelIconConfig } from '@falang/editor-scheme';
import { SwitchThreadHeaderBlockTransformer } from './blocks/switch-thread-header/SwitchThreadHeader.block.transformer';
import { getSwitchIconConfig } from '@falang/editor-scheme';
import { FunctionHeaderBlockTransformer } from './blocks/function-header/FunctionHeader.block.transformer';
import { TextBlockTransformer } from '@falang/infrastructure-text';
import { CallFunctionBlockTransformer } from './blocks/call-function/CallFunction.block.transformer';
import { FromToCycleHeaderBlockTransformer } from './blocks/from-to-cycle-header/FromToCycleHeader.block.transformer';
import { getOutputIconConfig } from '@falang/editor-scheme';
import { ArrPopBlockTransformer } from './blocks/arrays/arr_pop/ArrPop.block.transformer';
import { ArrPushBlockTransformer } from './blocks/arrays/arr_push/ArrPush.block.transformer';
import { ArrShiftBlockTransformer } from './blocks/arrays/arr_shift/ArrShift.block.transformer';
import { ArrSpliceBlockTransformer } from './blocks/arrays/arr_splice/ArrSplice.block.transformer';
import { ArrUnshiftBlockTransformer } from './blocks/arrays/arr_unshift/ArrUnshift.block.transformer';

export const getLogicInfrastructureConfig = () => {
  const createBlockTransformer = new ExpressionBlockTransformer({
    type: 'create',
  });
  const assignBlockTransformer = new ExpressionBlockTransformer({
    type: 'assign',
  });
  const booleanBlockTransformer = new ExpressionBlockTransformer({
    type: 'boolean',
    defaultExpression: 'x',
  });
  const scalarBlockTransformer = new ExpressionBlockTransformer({
    type: 'scalar',
    defaultExpression: 'x',
  });
  const switchThreadHeaderBlockTransformer = new SwitchThreadHeaderBlockTransformer({
    defaultExpression: '',
  })
  const foreachHeaderBlockTransformer = new ForeachHeaderBlockTransformer();
  const fromToCycleHeaderBlockTransformer = new FromToCycleHeaderBlockTransformer();

  const functionHeaderBlockTransformer = new FunctionHeaderBlockTransformer({
    overrideName: (scheme) => scheme.name,
  });

  const textBlockTransformer = new TextBlockTransformer;

  const outTransformer = new OutTransformer({
    alias: 'system',
    throwBlockTransformer: textBlockTransformer,
    dtoConstructor: OutDto,
  });

  const functionFooterBlockTransformer = new TextBlockTransformer({
    fixedText: 'End',
  });

  const callFunctionBlockTransformer = new CallFunctionBlockTransformer({ type: 'internal' });
  const callApiBlockTransformer = new CallFunctionBlockTransformer({ type: 'api' });

  const logBlockTranformer = new ExpressionBlockTransformer({ type: 'string', title: 'logic:log', defaultExpression: '' });

  const returnValue = {
    name: 'logic',
    type: 'scheme',
    icons: {
      create_var: getActionIconConfig({ blockTransformer: createBlockTransformer, alias: 'create_var' }),
      assign_var: getActionIconConfig({ blockTransformer: assignBlockTransformer, alias: 'assign_var' }),
      function: getFunctionIconConfig({
        footerBlockTransformer: functionFooterBlockTransformer,
        blockTransformer: functionHeaderBlockTransformer,
        headerBlockTransformer: textBlockTransformer,
        fillBlockWidth: true,
      }),
      if: getIfIconConfig({ blockTransformer: booleanBlockTransformer, outTransformer }),
      foreach: getForEachConfig({ blockTransformer: foreachHeaderBlockTransformer }),
      from_to_cycle: getForEachConfig({
        blockTransformer: fromToCycleHeaderBlockTransformer,
        alias: 'from_to_cycle',
      }),
      while: getWhileConfig({ blockTransformer: booleanBlockTransformer }),
      'pseudo-cycle': getPseudoCycleConfig({}),
      parallel: getParallelIconConfig({}),
      switch: getSwitchIconConfig({
        blockTransformer: scalarBlockTransformer,
        switchOptionBlockTransformer: switchThreadHeaderBlockTransformer,
        outTransformer,
      }),
      call_function: getActionIconConfig({ blockTransformer: callFunctionBlockTransformer, alias: 'call_function' }),
      call_api: getActionIconConfig({ blockTransformer: callApiBlockTransformer, alias: 'call_api' }),
      log: getOutputIconConfig({ alias: 'log', blockTransformer: logBlockTranformer }),
      arr_pop: getActionIconConfig({ blockTransformer: new ArrPopBlockTransformer(), alias: 'arr_pop'}),
      arr_push: getActionIconConfig({ blockTransformer: new ArrPushBlockTransformer(), alias: 'arr_push'}),
      arr_shift: getActionIconConfig({ blockTransformer: new ArrShiftBlockTransformer(), alias: 'arr_shift'}),
      arr_splice: getActionIconConfig({ blockTransformer: new ArrSpliceBlockTransformer(), alias: 'arr_splice'}),
      arr_unshift: getActionIconConfig({ blockTransformer: new ArrUnshiftBlockTransformer(), alias: 'arr_unshift'}),
    },
    skewerIcons: [
      "create_var",
      "assign_var",
      "if",
      "foreach",
      "while",
      'pseudo-cycle',
      //'parallel',
      'switch',
      'from_to_cycle',
      'log',
    ],
    skewerIconsGroups: [{
      name: 'logic:arrays',
      icons: [
        'arr_pop',
        'arr_push',
        'arr_shift',
        //'arr_splice',
        'arr_unshift',
      ],
    }],
    outs: outTransformer,
  } satisfies IInfrastructureConfig;

  return returnValue;
}
