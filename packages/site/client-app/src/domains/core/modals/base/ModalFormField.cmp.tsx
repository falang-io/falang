import { observer } from 'mobx-react';
import React from 'react'
import { ModalModel } from './Modal.model'
import { FormGroupProps, FormGroup } from '@blueprintjs/core';

interface ModalFormFieldProps extends React.PropsWithChildren, FormGroupProps {
  property: string;
  modal: ModalModel;
}

export const ModalFormField: React.FC<ModalFormFieldProps> = observer(({
  modal,
  children,
  property,
  ...props
}) => {
  if(modal.hasFieldError(property)) {
    props.intent = 'danger';
    props.helperText = modal.fieldError(property);
  }
  return <FormGroup {...props} >
    {children}
  </FormGroup>
});
