import type { Scheme } from '../scheme/scheme.js';

export interface IModule {
  register?: (scheme: Scheme) => void;
  initialize?: (scheme: Scheme) => void;
  dispose?: (scheme: Scheme) => void;
}
