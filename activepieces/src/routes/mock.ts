import { Router } from 'express';
import { createMockItem, listMockItems } from '../pieces/mock-piece.js';

/**
 * Test-only fixture endpoints, mounted only when `NODE_ENV=test` (see `main.ts`) — lets an e2e test
 * simulate an external event ("someone created an item on the real vendor") independently of the
 * mock piece's own action, and inspect the store afterwards instead of asserting through a real
 * vendor's own UI. See ADR 0013 (private).
 */
export const mockRouter = Router();

mockRouter.post('/mock/items', (req, res) => {
  const { title, content } = (req.body ?? {}) as { title?: string; content?: string };
  if (typeof title !== 'string') {
    res.status(400).json({ message: '"title" is required' });
    return;
  }
  res.json(createMockItem(title, content ?? ''));
});

mockRouter.get('/mock/items', (_req, res) => {
  res.json(listMockItems());
});
