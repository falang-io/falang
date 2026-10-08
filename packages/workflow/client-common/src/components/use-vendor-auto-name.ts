import { useRef } from 'react';
import type { FormInstance } from 'antd';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { nameForPickedVendor, type IIntegrationFormValues } from '../integrations-editor-form.js';

/**
 * A new integration's "Name" follows the picked vendor until the user types their own (`nameForPickedVendor`).
 * `reset()` on opening the "add" dialog, `apply(vendor)` whenever the vendor changes there.
 */
export const useVendorAutoName = (
  form: FormInstance<IIntegrationFormValues>,
  findIntegration: (vendor: string) => IWorkflowIntegration | null | undefined,
  t: (key: string) => string,
): { reset(): void; apply(vendor: string | null): void } => {
  const autoName = useRef<string | null>(null);
  return {
    reset: () => {
      autoName.current = null;
    },
    apply: (vendor) => {
      const label = vendor ? findIntegration(vendor)?.label : null;
      if (!label) return;
      const vendorName = t(label);
      form.setFieldValue('name', nameForPickedVendor(form.getFieldValue('name') ?? '', autoName.current, vendorName));
      autoName.current = vendorName;
    },
  };
};
