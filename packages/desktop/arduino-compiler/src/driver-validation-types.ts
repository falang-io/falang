import type { IProjectDocument } from '@falang/dto';
import type { IDevicesDocumentData, IDriverConfig } from '@falang/desktop-arduino-dto';

/**
 * `validateDriverBundle` — ADR 0054 (private) §4: schema, name collisions, template type-check, an optional
 * `arduino-cli` hook and a project-usages re-check, run in order and stopping at the first failing stage
 * (warnings accumulate). Plain Node; shared by the app's `main` and `@falang/desktop-mcp`.
 */
export type TDriverValidationStage = 'schema' | 'collisions' | 'templates' | 'cli' | 'usages';

export interface IDriverValidationIssue {
  readonly stage: TDriverValidationStage;
  readonly message: string;
  /** The action id (or `device` for the device `setupTemplate`) the issue is about. */
  readonly action?: string;
  readonly documentId?: string;
  readonly nodeId?: string;
}

export interface IDriverValidationResult {
  readonly ok: boolean;
  readonly errors: readonly IDriverValidationIssue[];
  readonly warnings: readonly IDriverValidationIssue[];
}

export interface IDriverValidationProject {
  readonly documents: readonly IProjectDocument[];
  readonly devicesData?: IDevicesDocumentData | null;
}

/** What a stage-4 `arduino-cli compile` of the synthetic sketch reports; an implementation turns a missing CLI/core/library into `warnings`. */
export interface IDriverCliCheckResult {
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
}

export interface IValidateDriverBundleContext {
  /** The project's other drivers (incl. bundled ones); `scope` lets a same-id bundled driver produce an "overrides built-in" warning. */
  readonly otherDrivers: readonly (IDriverConfig & { readonly scope?: 'bundled' | 'library' | 'project' })[];
  /** Project documents + `Devices` data — enables stage 5 (usages). Omit for a library-scope save. */
  readonly project?: IDriverValidationProject;
  /** Stage 4 hook (phase 2 wires the real `arduino-cli compile` of these sketch files); absent → stage 4 is skipped silently. */
  readonly runCliCheck?: (sketchFiles: Readonly<Record<string, string>>) => Promise<IDriverCliCheckResult>;
}

export interface IDriverUsage {
  readonly kind: 'node' | 'device';
  readonly documentId: string;
  /** `kind: 'node'` only. */
  readonly nodeId?: string;
  readonly actionId?: string;
  /** `kind: 'device'` only. */
  readonly instanceId?: string;
}
