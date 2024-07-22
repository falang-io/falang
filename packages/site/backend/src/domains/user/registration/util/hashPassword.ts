import md5 from 'md5';

export const hashPassword = (password: string, salt: string): string => {
  console.log({ password, salt, md5: md5(password + salt) });
  return md5(password + salt);
};
