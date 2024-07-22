const nameRegexp = /^[a-zA-Z]([a-zA-Z0-9_]*)$/;

export const validateName = (name: string): boolean => {
  return nameRegexp.test(name);
}
