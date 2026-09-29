import { createAction, createPiece, createTrigger, PieceAuth, Property } from '@activepieces/pieces-framework';
import { TriggerStrategy } from '@activepieces/shared';

/**
 * In-memory fixture piece, registered only when `NODE_ENV=test` (see `registry.ts`) — replaces the
 * real WordPress e2e fixture (docker-compose's `wordpress`/`wordpress-db`/`wordpress-cli` services)
 * with something that exercises the exact same adapter surface (`CustomAuth` with a text + a secret
 * field, one action, one `POLLING` trigger) without standing up a real vendor. See
 * ADR 0013 (private).
 *
 * State lives in this module's closure, for this process's lifetime — same tolerance already
 * accepted for the real poll state in `routes/poll.ts` (lost on restart, acceptable for a test
 * fixture). `routes/mock.ts` reaches into `createMockItem`/`listMockItems` directly so an e2e test
 * can create an item "externally" (simulating a real vendor-side event, the same role
 * `createWordpressPost` played against the real REST API) without going through this piece's own
 * action.
 */
export interface IMockItem {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly createdAt: number;
}

let items: IMockItem[] = [];
let nextId = 1;

export const createMockItem = (title: string, content: string): IMockItem => {
  const item: IMockItem = { id: String(nextId++), title, content, createdAt: Date.now() };
  items.push(item);
  return item;
};

export const listMockItems = (): readonly IMockItem[] => items;

export const resetMockItems = (): void => {
  items = [];
  nextId = 1;
};

const auth = PieceAuth.CustomAuth({
  displayName: 'Mock account',
  required: true,
  props: {
    workspace: Property.ShortText({ displayName: 'Workspace', required: true }),
    apiKey: PieceAuth.SecretText({ displayName: 'API key', required: true }),
  },
});

const createItemAction = createAction({
  name: 'create_item',
  displayName: 'Create item',
  description: 'Creates an item in the mock in-memory store.',
  auth,
  props: {
    title: Property.ShortText({ displayName: 'Title', required: true }),
    content: Property.LongText({ displayName: 'Content', required: false }),
  },
  run: async (context) => createMockItem(context.propsValue.title, context.propsValue.content ?? ''),
});

/**
 * Mirrors the real `wordpress` piece's `new_post` trigger shape (see ADR 0011): `onEnable` seeds a
 * `lastPoll` watermark so items created before activation aren't replayed, `run` returns everything
 * newer than that watermark and advances it.
 */
const newItemTrigger = createTrigger({
  name: 'new_item',
  displayName: 'New item',
  description: 'Polls for items created after the trigger was enabled.',
  auth,
  props: {},
  type: TriggerStrategy.POLLING,
  sampleData: {},
  onEnable: async (context) => {
    await context.store.put('lastPoll', Date.now());
  },
  onDisable: async () => {},
  run: async (context) => {
    const lastPoll = (await context.store.get<number>('lastPoll')) ?? 0;
    const newItems = listMockItems().filter((item) => item.createdAt > lastPoll);
    if (newItems.length > 0) {
      await context.store.put('lastPoll', Date.now());
    }
    return newItems;
  },
});

export const mockPiece = createPiece({
  displayName: 'Mock (test only)',
  logoUrl: '',
  authors: ['falang'],
  description:
    'In-memory fixture piece for exercising the ActivePieces adapter in tests — never registered outside NODE_ENV=test.',
  auth,
  actions: [createItemAction],
  triggers: [newItemTrigger],
});
