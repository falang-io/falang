import type { IconStore, Scheme } from '@falang/scheme';
import {
  CMD_INSERT_NODE,
  createINodeByName,
  createNodeStoreFromNode,
  DebuggerModule,
  DebugSessionStore,
  HistoryModule,
  TOKEN_HISTORY,
  isStatementIcon,
  setRootNodeForScheme,
  setSchemeStartPosition,
  useService,
  TOKEN_SCHEME,
  type IModule,
} from '@falang/scheme';
import { FakeDebugAdapter, type IFakeDebugStep } from '@falang/debug';
import { AgentModule } from '@falang/agent';
import { resolveService } from '@falang/di';
import { functionalSchemeFactory, mindTreeSchemeFactory } from '@falang/text-scheme';
import type React from 'react';
import { observer } from 'mobx-react-lite';
import { createDemoLlmClient } from './agent-demo.ts';

export type TPlaygroundRootKind = 'function' | 'contour' | 'mind-tree';

export const PLAYGROUND_ROOT_KINDS: readonly TPlaygroundRootKind[] = ['function', 'contour', 'mind-tree'];

export const DOCUMENT_ID = 'playground-doc';

/** Bodies seeded with a few statements so the fake debugger has something to walk through. */
const SEEDED_BODIES: Record<TPlaygroundRootKind, string | null> = {
  function: 'function-body',
  contour: 'contour-function-body',
  'mind-tree': null,
};

const MousePositionComponent: React.FC = observer(() => {
  const scheme = useService(TOKEN_SCHEME);
  const theme = scheme.theme.value;
  return (
    <div
      style={{
        position: 'absolute',
        right: 10,
        bottom: 10,
        padding: '2px 6px',
        background: theme.iconBackground,
        color: theme.textColor,
        border: `1px solid ${theme.iconBorderColor}`,
        fontFamily: 'monospace',
        fontSize: 12,
      }}
    >
      {Math.round(scheme.mousePosition.x)}&nbsp;{Math.round(scheme.mousePosition.y)}
    </div>
  );
});

class MousePositionModule implements IModule {
  initialize(scheme: Scheme) {
    scheme.extraView.registerCoreSchemeLayer(MousePositionComponent);
  }
}

/**
 * ADR 0021 Phase 0: one debug session for the whole playground, driven by a fake adapter that
 * "executes" every statement icon of the current diagram in visual order (top-to-bottom, then
 * left-to-right) — no compiler, no runtime, just the shared modules.
 */
export const createDebugSession = (getScheme: () => Scheme | null): DebugSessionStore => {
  const collectStatementSteps = (): IFakeDebugStep[] => {
    const icons: IconStore[] = (getScheme()?.icons.all ?? [])
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
  return new DebugSessionStore(new FakeDebugAdapter({ getSteps: collectStatementSteps, stepDelayMs: 400 }));
};

export const createPlaygroundScheme = (kind: TPlaygroundRootKind, session: DebugSessionStore): Scheme => {
  const ref: { current: Scheme | null } = { current: null };
  const getScheme = (): Scheme => {
    if (!ref.current) throw new Error('Playground scheme is not built yet');
    return ref.current;
  };
  const extraModules: IModule[] = [
    new MousePositionModule(),
    new DebuggerModule({ session, documentId: DOCUMENT_ID }),
    new HistoryModule(),
    new AgentModule({ llmClient: createDemoLlmClient(getScheme) }),
  ];
  const scheme =
    kind === 'mind-tree' ? mindTreeSchemeFactory({ extraModules }) : functionalSchemeFactory({ extraModules });
  ref.current = scheme;

  setRootNodeForScheme(scheme, createNodeStoreFromNode(scheme.infra.structure.factory(kind), scheme));

  const bodyName = SEEDED_BODIES[kind];
  scheme.icons.all
    .filter((icon) => icon.name === bodyName)
    .forEach((body) => {
      ['action', 'if', 'action'].forEach((name, index) => {
        scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
          index,
          parentId: body.id,
          node: createINodeByName(name, scheme),
        });
      });
    });
  // The seed is part of the starting document, not something to undo.
  resolveService(TOKEN_HISTORY, scheme.container).clear();
  setSchemeStartPosition(scheme);

  return scheme;
};
