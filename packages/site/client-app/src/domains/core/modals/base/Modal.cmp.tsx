import { observer } from 'mobx-react';
import { ModalModel } from './Modal.model'
import { LoaderComponent } from '../../layout/cmp/Loader.cmp';
import { Dialog, DialogBody, Callout, DialogFooter } from '@blueprintjs/core';

export interface ModalProps {
  modal: ModalModel;
  Content: React.FC<{ modal: any }>,
  Footer: React.FC<{ modal: any }>,
}

export const Modal: React.FC<ModalProps> = observer(({
  modal,
  Content,
  Footer
}) => {
  return <Dialog isOpen={modal.isVisible} style={modal.dialogStyle}>
    <DialogBody>
      <Content modal={modal} />
      {modal.isError ? <Callout intent='danger'>
        {modal.errorText}
      </Callout> : null}
    </DialogBody>
    <DialogFooter
      actions={modal.busy
        ? <LoaderComponent height={20}></LoaderComponent>
        : <Footer modal={modal} />
      }
    >
    </DialogFooter>
  </Dialog>
});
