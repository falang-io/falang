import type { IDriverFieldDescriptor } from './driver-config.js';

/**
 * Problems with one field value against its descriptor: absent without default, or a select value that is no longer an
 * option. Shared by the driver validator's "usages" stage (`@falang/desktop-arduino-compiler`) and `prepareDevicesData`.
 */
export const driverFieldProblem = (field: IDriverFieldDescriptor, value: string | undefined): string | null => {
  if (field.kind === 'new-variable') return null;
  const effective = value ?? field.default ?? '';
  if (effective === '') {
    return field.kind === 'string' ? null : `field "${field.name}" has no value and no default`;
  }
  if (field.kind === 'select' && !field.options?.some((option) => option.value === effective)) {
    return `field "${field.name}" value "${effective}" is not one of the options`;
  }
  return null;
};
