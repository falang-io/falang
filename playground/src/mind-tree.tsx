// oxlint-disable no-console
import type { Scheme } from '@falang/scheme';
import { type IModule, setRootNodeForScheme, useService, TOKEN_SCHEME } from '@falang/scheme';
import { mindTreeSchemeFactory } from '@falang/text-scheme';
import { createNodeStoreFromNode } from '@falang/scheme';
import type React from 'react';
import { observer } from 'mobx-react-lite';
import './app.css';

const MIND_TREE_NAME = 'mind-tree';

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

const scheme = mindTreeSchemeFactory({ extraModules: [new MyModule()] });

const nodeData = scheme.infra.structure.factory(MIND_TREE_NAME);
const nodeStore = createNodeStoreFromNode(nodeData, scheme);
setRootNodeForScheme(scheme, nodeStore);

export { scheme };
