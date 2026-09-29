/** The nine ops of the fixed catalog (ADR 0041 (private) §2) — anything
 * beyond these is a new op added to both this service and the `media` vendor package, never a
 * free-form argument. */
export type TMediaOp =
  | 'media-probe'
  | 'media-image-resize'
  | 'media-image-convert'
  | 'media-video-trim'
  | 'media-video-concat'
  | 'media-video-thumbnail'
  | 'media-video-transcode'
  | 'media-audio-extract'
  | 'media-audio-convert';

/** Mirrors ADR 0038 (private)'s `File` reference — this service
 * never resolves a `publicUrl` itself, it only passes one through if the caller supplied it. */
export interface IFileRef {
  readonly id: string;
  readonly name: string;
  readonly size?: number;
  readonly mime?: string;
  readonly publicUrl?: string;
}

export interface IMediaInfo {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly bitrate: number;
  readonly mime: string;
}

export type TJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export type TMediaJobResult = IFileRef | readonly IFileRef[] | IMediaInfo;

export interface IMediaJobStatus {
  readonly status: TJobStatus;
  readonly progress?: number;
  readonly result?: TMediaJobResult;
  readonly error?: string;
}

/** Which environment's activity submitted the job — forwarded to the internal file upload as
 * `x-workflow-env`, same distinction `backend`'s internal file API keeps for every other write. */
export type TWorkflowEnv = 'dev' | 'prod';
