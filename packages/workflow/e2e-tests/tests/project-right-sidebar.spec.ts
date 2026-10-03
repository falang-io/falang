import { test, expect } from './fixtures.js';
import { clickProjectMenuItem, createProjectViaUI, createTreeItemViaUI, loginAndReachProjectList } from './fixtures.js';

/**
 * Browser-tier smoke spec for ADR 0036 (private) — proves
 * the UI wiring only: the toolbar's "Agent" button opens the project-level right sidebar's agent chat
 * panel (`.agent-chat-panel`), the panel survives a tab switch between two agent-capable documents
 * without being remounted (the whole point of moving it outside every scheme's `ContainerContext`,
 * see the ADR's problems 1/2), and "History" swaps it for the version-history panel, hiding the agent
 * panel — clicking "History" again closes the sidebar entirely. No LLM call is made; the panel works
 * (or degrades to a disabled input) whether or not ADR 0031 (private)'s admin agent config is set
 * on this e2e stack, so the tab-switch assertion is done via DOM-node identity (the same
 * `ElementHandle` still attached after switching tabs), which holds either way — see this repo's
 * `.claude/memory/feedback_antd_select_playwright_targeting.md` for why antd-rendered option/select
 * text is targeted by `title`, not `role`, elsewhere in this suite; nothing here needs that, but the
 * session-picker "New session" button (an icon-only antd `Button` whose accessible name comes from its
 * `title` prop) is targeted with `getByTitle` for the same reason.
 */
test.describe('project right sidebar', () => {
  test('agent panel survives a tab switch and History swaps/closes the sidebar', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAndReachProjectList(page);
    const projectName = `Right sidebar smoke ${Date.now()}`;
    await createProjectViaUI(page, projectName);
    await createTreeItemViaUI(page, 'function', 'funcOne');
    await createTreeItemViaUI(page, 'function', 'funcTwo');

    // Land on `funcOne`'s tab explicitly — creating a document opens its tab, but the second
    // `createTreeItemViaUI` call leaves `funcTwo` active, not `funcOne`.
    await page.getByRole('treeitem', { name: 'funcOne' }).click();

    await page.getByRole('button', { name: 'Agent' }).click();
    const agentPanel = page.locator('.agent-chat-panel');
    await expect(agentPanel).toBeVisible();

    // Create a session (a local/IndexedDB write, no LLM call) so the session picker has real state to
    // check for persistence across the tab switch below, alongside the DOM-identity check.
    await agentPanel.getByTitle('New session').click();
    // antd 6's Select has no `.ant-select-selector` wrapper any more (`@rc-component/select` renders the
    // chosen value inside `.ant-select-content`) — the root `.ant-select` holds the label either way.
    const sessionSelect = agentPanel.locator('.ant-select').first();
    await expect(sessionSelect).toContainText('New session');

    // If the agent is admin-configured on this stack, the textarea is enabled — type into it and
    // verify the text survives the tab switch too, since `AgentChatSessionStore`/`AgentSession` own
    // this state now (ADR 0036 (private) §2), not React-local state on a since-remounted component.
    const textarea = agentPanel.getByPlaceholder('Describe what the agent should change, or ask a question…');
    const textareaEnabled = await textarea.isEnabled();
    if (textareaEnabled) await textarea.fill('Add a log statement');

    const agentPanelHandle = await agentPanel.elementHandle();
    if (!agentPanelHandle) throw new Error('Expected .agent-chat-panel to have a DOM element handle');

    await page.getByRole('treeitem', { name: 'funcTwo' }).click();

    await expect(agentPanel).toBeVisible();
    // The exact same DOM node is still attached — the panel was never unmounted/remounted by the tab
    // switch, which is the ADR's whole point (problem 1: "the chat resets on tab switch").
    const stillAttached = await agentPanelHandle.evaluate((node) => document.body.contains(node));
    expect(stillAttached).toBe(true);
    await expect(sessionSelect).toContainText('New session');
    if (textareaEnabled) await expect(textarea).toHaveValue('Add a log statement');

    // `.first()`: once the version-history panel is open, its own primary action button ("Commit"/
    // "Name current version") carries the same `HistoryOutlined` icon, whose aria-label prefixes its
    // accessible name (e.g. "history Name current version") — a case-insensitive-substring `name:
    // 'History'` locator would otherwise match both it and the toolbar toggle button. Same gotcha
    // `version-history.spec.ts` already documents for its own `getByRole('button', { name: 'History'
    // })` locator.
    await clickProjectMenuItem(page, 'History');
    await expect(page.getByText('Version history')).toBeVisible();
    await expect(agentPanel).not.toBeVisible();

    await clickProjectMenuItem(page, 'History');
    await expect(page.getByText('Version history')).not.toBeVisible();
    await expect(agentPanel).not.toBeVisible();
  });
});
