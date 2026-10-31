// oxlint-disable no-void, prefer-global-this, unicorn/prefer-query-selector -- plain splash page script.
import type { TFlowSplashState } from '../../shared/ipc-channels.js';

interface IFlowBridge {
  getState(): Promise<TFlowSplashState>;
  onState(listener: (state: TFlowSplashState) => void): void;
  openDataFolder(): Promise<void>;
  quit(): Promise<void>;
}

const bridge = (window as unknown as { flow: IFlowBridge }).flow;
const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} is missing`);
  return element;
};

const render = (state: TFlowSplashState): void => {
  const isError = state.kind === 'error';
  byId('status').style.display = isError ? 'none' : 'block';
  byId('error').style.display = isError ? 'block' : 'none';
  if (state.kind === 'starting') byId('status').textContent = state.text;
  else {
    byId('message').textContent = state.message;
    byId('log').textContent = state.logTail;
  }
};

byId('open-data').addEventListener('click', () => void bridge.openDataFolder());
byId('quit').addEventListener('click', () => void bridge.quit());
bridge.onState(render);
void bridge.getState().then(render);
