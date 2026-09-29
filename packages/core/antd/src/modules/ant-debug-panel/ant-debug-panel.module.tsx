import type React from 'react';
import type { IModule, Scheme } from '@falang/scheme';
import { DebugPanel, type IDebugPanelProps } from './debug-panel.cmp.js';

export type IAntDebugPanelModuleParams = IDebugPanelProps;

/**
 * Mounts `DebugPanel` as a floating overlay in the scheme's top-right corner — for hosts without
 * their own right-hand sidebar (the `playground`). The workflow client and the Arduino app embed
 * `DebugPanel` in their existing `Sidebar` column instead (ADR 0021 §3) and don't use this module.
 */
export class AntDebugPanelModule implements IModule {
  private readonly params: IAntDebugPanelModuleParams;

  constructor(params: IAntDebugPanelModuleParams) {
    this.params = params;
  }

  initialize(scheme: Scheme) {
    const params = this.params;
    const Layer: React.FC = () => (
      <div
        style={{
          position: 'absolute',
          right: 10,
          top: 10,
          width: 340,
          maxHeight: 'calc(100% - 20px)',
          overflow: 'auto',
          padding: 10,
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid #ccc',
          borderRadius: 6,
          zIndex: 1000,
        }}
      >
        <DebugPanel {...params} />
      </div>
    );
    scheme.extraView.registerCoreSchemeLayer(Layer);
  }
}
