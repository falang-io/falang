import { Router } from 'express';
import { PIECES_REGISTRY } from '../pieces/registry.js';
import { normalizePiece } from '../pieces/normalize.js';

export const piecesRouter = Router();

piecesRouter.get('/pieces', (_req, res) => {
  const pieces = Object.entries(PIECES_REGISTRY).map(([pieceName, piece]) => normalizePiece(pieceName, piece));
  res.json(pieces);
});
