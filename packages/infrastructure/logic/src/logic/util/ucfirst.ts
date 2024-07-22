export const ucfirst = (str: string): string => {
  if (!str.length) return str;
  return str[0].toUpperCase().concat(str.slice(1));
};
