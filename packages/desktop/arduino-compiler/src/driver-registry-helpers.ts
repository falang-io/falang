import { createHash } from 'node:crypto';
import type { IDriverConfig } from '@falang/desktop-arduino-dto';
import type { TDriverScope } from './driver-list-types.js';
import type { IDriverValidationResult } from './driver-validation-types.js';

export const describeIssues = (result: IDriverValidationResult): string[] =>
  result.errors.map((issue) => `[${issue.stage}] ${issue.message}`);

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const bundleErrors = (error: unknown): string[] => {
  const messages = (error as { messages?: unknown }).messages;
  return Array.isArray(messages) ? messages.map(String) : [errorMessage(error)];
};

export const othersSignature = (others: readonly IDriverConfig[]): string =>
  createHash('sha256')
    .update(
      JSON.stringify(
        others
          .map((other) => [other.id, other.declarations])
          .toSorted(([a], [b]) => String(a).localeCompare(String(b))),
      ),
    )
    .digest('hex');

export const withScope = (config: IDriverConfig, scope: TDriverScope): IDriverConfig & { scope: TDriverScope } => ({
  ...config,
  scope,
});
