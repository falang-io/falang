import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import type { IApiSandboxPlatform } from './api-types.js';

type TSandboxCapable = Pick<IWorkflowIntegration, 'vendor'> & Partial<Pick<IWorkflowIntegration, 'sandbox'>>;

/** The configured test-bot platform of a vendor, if the vendor supports sandbox mode and the deployment has a bot for it. */
export const findSandboxPlatform = (
  integration: TSandboxCapable | null | undefined,
  platforms: readonly IApiSandboxPlatform[],
): IApiSandboxPlatform | null => {
  if (!integration?.sandbox) return null;
  return platforms.find((platform) => platform.vendor === integration.vendor) ?? null;
};

/** The "Dev: test in the platform bot" switch is offered only for a sandbox-capable vendor with a configured test bot. */
export const shouldShowSandboxSwitch = (
  integration: TSandboxCapable | null | undefined,
  platforms: readonly IApiSandboxPlatform[],
): boolean => findSandboxPlatform(integration, platforms) !== null;

/** With sandbox on, the dev value of the vendor's token field is not needed (dev talks through the test bot). */
export const isDevTokenOptional = (
  integration: { readonly sandbox?: IWorkflowIntegration['sandbox'] } | null | undefined,
  devSandbox: boolean,
): boolean => Boolean(integration?.sandbox) && devSandbox;

/** `true` for the fields of the instance that go through the test bot in dev: the adapter's token field. */
export const isSandboxTokenField = (
  integration: { readonly sandbox?: IWorkflowIntegration['sandbox'] } | null | undefined,
  fieldName: string,
): boolean => integration?.sandbox?.tokenField === fieldName;

/** Whether `devSandbox: true` is persisted: only for a sandbox-capable vendor with the switch on. */
export const resolveDevSandbox = (
  integration: { readonly sandbox?: IWorkflowIntegration['sandbox'] } | null | undefined,
  enabled: boolean,
): boolean => Boolean(integration?.sandbox) && enabled;

/** "m:ss" until `expiresAt`, `'0:00'` once it has passed. */
export const formatRemaining = (expiresAt: string, now: number): string => {
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const isExpired = (expiresAt: string, now: number): boolean => new Date(expiresAt).getTime() <= now;

/** Locale key (under `client:integrations-editor.`) for a sandbox link/binding error; falls back to the generic one. */
export const sandboxErrorKey = (code?: string): string => {
  if (code === 'sandbox_off') return 'sandbox-error-off';
  if (code === 'sandbox_not_configured') return 'sandbox-error-not-configured';
  return 'sandbox-error-generic';
};
