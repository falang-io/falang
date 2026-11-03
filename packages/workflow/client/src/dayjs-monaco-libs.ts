import { setMonacoLibVariant, type TMonacoExtraLibFiles } from '@falang/typescript-scheme';
import dayjsIndex from 'dayjs/index.d.ts?raw';
import customParseFormat from 'dayjs/plugin/customParseFormat.d.ts?raw';
import duration from 'dayjs/plugin/duration.d.ts?raw';
import isBetween from 'dayjs/plugin/isBetween.d.ts?raw';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.d.ts?raw';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.d.ts?raw';
import relativeTime from 'dayjs/plugin/relativeTime.d.ts?raw';
import timezone from 'dayjs/plugin/timezone.d.ts?raw';
import utc from 'dayjs/plugin/utc.d.ts?raw';

/**
 * The `.d.ts` files of the plugins `@falang/workflow-compiler` extends `dayjs` with (`WORKFLOW_DAYJS_PLUGINS`,
 * kept equal by `dayjs-monaco-libs.test.ts`). `?raw` imports must be literal, hence the explicit list.
 */
export const DAYJS_PLUGIN_DECLARATIONS: Readonly<Record<string, string>> = {
  utc,
  timezone,
  customParseFormat,
  duration,
  relativeTime,
  isBetween,
  isSameOrBefore,
  isSameOrAfter,
};

/** The editor's view of the compiled workflows module's `dayjs` global (see the compiler's `dayjs-runtime.ts`). */
export const DAYJS_GLOBAL_DECLARATION = "declare const dayjs: typeof import('dayjs');\n";

export const buildDayjsMonacoLibs = (): TMonacoExtraLibFiles => ({
  'file:///node_modules/dayjs/index.d.ts': dayjsIndex,
  ...Object.fromEntries(
    Object.entries(DAYJS_PLUGIN_DECLARATIONS).map(([plugin, content]) => [
      `file:///node_modules/dayjs/plugin/${plugin}.d.ts`,
      content,
    ]),
  ),
  'file:///falang-workflow-globals.d.ts': DAYJS_GLOBAL_DECLARATION,
});

/** Makes `dayjs` a known global in every workflow editor field and in the background validation. */
export const installWorkflowMonacoLibs = (): void => setMonacoLibVariant('full', '', buildDayjsMonacoLibs());
