import { Dialog, DialogBody } from '@blueprintjs/core';
import { runInAction } from 'mobx';
import { observer } from 'mobx-react';
import { AppState } from './AppState';

export const AboutModalComponent: React.FC<{ state: AppState }> = observer(({ state }) => {
  return <Dialog
    isOpen={state.aboutModalVisible}
    onClose={() => runInAction(() => state.aboutModalVisible = false)}
    isCloseButtonShown={true}
    title='About'
  >
    <DialogBody>
      <p><b>Falang</b>: Friendly Algorithmic Programming Language</p>
      <p>Development version</p>
      <p>Author: Sachik Sergey (<a href='mailto:sachik-sergey@yandex.ru'>sachik-sergey@yandex.ru</a>)</p>
      <p>Site: <a target='_blank' href='https://falang.io/'>falang.io</a></p>
      <p>Version: {state.version}</p>
    </DialogBody>
  </Dialog>
});
