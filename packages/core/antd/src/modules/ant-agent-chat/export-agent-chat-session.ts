import type { IChatSession } from '@falang/agent';

/** On-disk shape of an exported session — `session` is the full `IChatSession` verbatim (every turn, every
 *  tool-call step with its raw input/result), so the file is self-contained enough to review or debug a run
 *  without the app that produced it. `exportedAt`/`format` are metadata about the export itself, not the
 *  session, kept separate so a reader (human or tool) can tell them apart from the start. */
export interface IAgentChatSessionExport {
  readonly format: 'falang-agent-chat-session';
  readonly formatVersion: 1;
  readonly exportedAt: string;
  readonly session: IChatSession;
}

export const buildAgentChatSessionExport = (session: IChatSession): IAgentChatSessionExport => ({
  exportedAt: new Date().toISOString(),
  format: 'falang-agent-chat-session',
  formatVersion: 1,
  session,
});

const sanitizeFileNamePart = (value: string): string => {
  const sanitized = value.trim().replaceAll(/[^a-z0-9-_]+/gi, '-');
  return sanitized || 'session';
};

/** Mirrors `Toolbar.handleExport`'s own file-name shape (`client-common/src/components/toolbar.tsx`) —
 *  the human-readable title first (so the file is identifiable in a downloads list/attachment), the raw
 *  session id appended so two same-titled sessions never collide. */
export const buildAgentChatSessionExportFileName = (session: IChatSession): string =>
  `agent-chat-${sanitizeFileNamePart(session.title)}-${sanitizeFileNamePart(session.id)}.json`;

/** Triggers a browser download of `session` as pretty-printed JSON — same `Blob` + `URL.createObjectURL` +
 *  anchor-click pattern as `Toolbar.handleExport`'s project export, which every host this panel is embedded
 *  in already relies on (the workflow client's real browser, and both desktop apps' Chromium renderer). */
export const downloadAgentChatSessionExport = (session: IChatSession): void => {
  const payload = buildAgentChatSessionExport(session);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildAgentChatSessionExportFileName(session);
  link.click();
  URL.revokeObjectURL(url);
};
