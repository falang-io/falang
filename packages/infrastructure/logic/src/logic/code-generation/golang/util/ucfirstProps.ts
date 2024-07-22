import { ucfirst } from '../../../util/ucfirst';

export const ucfirstProps = (str: string): string => {
  const arr = str.split('.');
  for(let i = 1; i < arr.length; i++) {
    arr[i] = ucfirst(arr[i]);
  }
  return arr.join('.');
};
