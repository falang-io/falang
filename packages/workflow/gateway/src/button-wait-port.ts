/** Registry of runs waiting for a command-button press on a particular outgoing message. */
export interface IButtonWaitClaimParams {
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
  readonly vendor: string;
  readonly credentialId: string;
  readonly waitId: string;
  readonly chatId: string;
  readonly messageId: string;
}

export interface IClaimedButtonWait {
  readonly waitId: string;
  readonly workflowId: string;
  readonly runId: string;
}

export interface IButtonWaitPort {
  /** Atomically removes and returns the matching unexpired wait, or `null` for a stale/foreign/duplicate press. */
  claim(params: IButtonWaitClaimParams): Promise<IClaimedButtonWait | null>;
}
