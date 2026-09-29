// oxlint-disable no-console
// oxlint-disable max-lines
import type { IconStore, NodeStore, Scheme } from '@falang/scheme';
import {
  CMD_INSERT_NODE,
  createINodeByName,
  DebuggerModule,
  DebugSessionStore,
  HistoryModule,
  isStatementIcon,
  setRootNodeForScheme,
  useService,
  TOKEN_SCHEME,
  type IModule,
} from '@falang/scheme';
import { AntDebugPanelModule } from '@falang/antd';
import { FakeDebugAdapter, type IFakeDebugStep } from '@falang/debug';
import { AgentModule, ScriptedLlmClient } from '@falang/agent';
import type { ILlmCompleteParams, ILlmResponse } from '@falang/agent';
import './app.css';
import { functionalSchemeFactory } from '@falang/text-scheme';
import { createNodeStoreFromNode } from '@falang/scheme';
import type React from 'react';
import { observer } from 'mobx-react-lite';

const MousePositionComponent: React.FC = observer(() => {
  const scheme = useService(TOKEN_SCHEME);
  return (
    <div
      style={{
        position: 'absolute',
        right: 10,
        bottom: 10,
        padding: 2,
        background: 'white',
        border: '1px solid black',
      }}
    >
      {Math.round(scheme.mousePosition.x)}&nbsp;{Math.round(scheme.mousePosition.y)}
    </div>
  );
});

class MyModule implements IModule {
  initialize(scheme: Scheme) {
    scheme.extraView.registerCoreSchemeLayer(MousePositionComponent);
  }
}

// ADR 0021 Phase 0: the debugger UI driven by a fake adapter that "executes" every statement icon
// of the live diagram in document order — no compiler, no runtime, just the shared modules.
const DOCUMENT_ID = 'playground-doc';
const schemeRef: { current: Scheme | null } = { current: null };

// Visual order (top-to-bottom, then left-to-right) stands in for execution order — good enough to
// watch the highlight move; a real transport follows the compiled program instead.
const collectStatementSteps = (): IFakeDebugStep[] => {
  const icons: IconStore[] = (schemeRef.current?.icons.all ?? [])
    .filter((icon) => isStatementIcon(icon))
    .toSorted((a, b) => a.y - b.y || a.x - b.x);
  return icons.map((icon, index) => ({
    location: { documentId: DOCUMENT_ID, nodeId: icon.id },
    variables: [
      { name: 'step', type: 'number', value: index },
      { name: 'node', type: 'string', value: icon.name },
      { name: 'data', value: (icon.dataNode.data ?? null) as never },
    ],
  }));
};

const session = new DebugSessionStore(new FakeDebugAdapter({ getSteps: collectStatementSteps, stepDelayMs: 400 }));

// ADR 0009 demo: a scripted "LLM" that adds two statements then edits the first one, driving
// AgentModule/HistoryModule end to end without a real vendor call. Finds its target the same way
// a real model would have to — the first node whose kind accepts arbitrary children — rather than
// hardcoding a node id, so it keeps working if the seeded document above changes shape.
const findFirstNodeAcceptingAnyChildren = (): NodeStore => {
  const currentScheme = schemeRef.current;
  if (!currentScheme?.rootNode) throw new Error('Playground agent demo: scheme has no root node yet');
  const stack = currentScheme.infra.structure;
  const visit = (node: NodeStore): NodeStore | null => {
    if (stack.getConfig(node.name).children === true) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  const found = visit(currentScheme.rootNode);
  if (!found) throw new Error('Playground agent demo: no node with children: true found');
  return found;
};

const getFirstInsertedId = (params: ILlmCompleteParams): string => {
  const firstToolMessage = params.messages.find((m) => m.role === 'tool');
  if (!firstToolMessage || firstToolMessage.role !== 'tool') {
    throw new Error('Playground agent demo: no tool message in history yet');
  }
  return (JSON.parse(firstToolMessage.results[0].content) as { insertedId: string }).insertedId;
};

const demoClient = new ScriptedLlmClient([
  (): ILlmResponse => {
    const parent = findFirstNodeAcceptingAnyChildren();
    return {
      text: '',
      toolCalls: [
        {
          id: 'demo-1',
          input: { data: 'Шаг агента 1', index: 0, name: 'action', parentId: parent.id },
          name: 'insert_node',
        },
      ],
    };
  },
  (): ILlmResponse => {
    const parent = findFirstNodeAcceptingAnyChildren();
    return {
      text: '',
      toolCalls: [
        {
          id: 'demo-2',
          input: { data: 'Шаг агента 2', index: 1, name: 'action', parentId: parent.id },
          name: 'insert_node',
        },
      ],
    };
  },
  (params: ILlmCompleteParams): ILlmResponse => {
    const insertedId = getFirstInsertedId(params);
    return {
      text: '',
      toolCalls: [{ id: 'demo-3', input: { data: 'Шаг агента 1 (обновлён)', id: insertedId }, name: 'set_data' }],
    };
  },
  (): ILlmResponse => ({
    text: '',
    toolCalls: [{ id: 'demo-4', input: { summary: 'Added two demo steps' }, name: 'finish' }],
  }),
]);

const scheme = functionalSchemeFactory({
  extraModules: [
    new MyModule(),
    new DebuggerModule({ session, documentId: DOCUMENT_ID }),
    new AntDebugPanelModule({ session, onStart: () => session.start({ pauseOnEntry: true }) }),
    new HistoryModule(),
    new AgentModule({ llmClient: demoClient }),
  ],
});
schemeRef.current = scheme;

const iconToCreate = 'contour';
const nodeData = scheme.infra.structure.factory(iconToCreate);
const nodeStore = createNodeStoreFromNode(nodeData, scheme);
setRootNodeForScheme(scheme, nodeStore);

// A fresh contour document has empty function bodies — seed a few statements so the fake
// debugger has something to walk through.
scheme.icons.all
  .filter((icon) => icon.name === 'contour-function-body')
  .forEach((body) => {
    ['action', 'if', 'action'].forEach((name, index) => {
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index,
        parentId: body.id,
        node: createINodeByName(name, scheme),
      });
    });
  });

// Handy for poking at the live instances from the browser console / a Playwright script.
Object.assign(globalThis, { __playground: { scheme, session } });

export { scheme, session };
