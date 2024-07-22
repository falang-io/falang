export const deepEqual = (x: any, y: any): boolean => {
  if (x === y) {
    return true;
  }

  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y)) return false;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (!deepEqual(x[i], y[i])) return false;
    }
    return true;
  }

  if (typeof x !== 'object' || x === null) return false;
  if (typeof y !== 'object' || y === null) return false;

  if (Object.keys(x).length != Object.keys(y).length) return false;

  for (const prop in x) {
    if (!y.hasOwnProperty(prop) || !deepEqual(x[prop], y[prop])) return false;
  }

  return true;
}