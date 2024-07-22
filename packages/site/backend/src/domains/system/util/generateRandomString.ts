const possible =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const generateRandomString = (length: number): string => {
  let returnValue = '';
  for (let i = 0; i < length; i++) {
    returnValue += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return returnValue;
};
