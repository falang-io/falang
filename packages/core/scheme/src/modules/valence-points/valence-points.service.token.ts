import { createSchemeToken } from '@falang/di';
import type { ValencePointsService } from './valence-points.service.js';

export const TOKEN_VALENCE_POINTS = createSchemeToken<ValencePointsService>('VALENCE_POINTS');
