# @falang/workflow-media

ffmpeg job service (ADR 0041 (private)). `POST /jobs`, `GET`/`DELETE /jobs/:jobId?projectId=…`, `GET /health`.

## Authentication

Every job call carries `x-internal-project-token` plus the `projectId` (body for `POST`, query for `GET`/`DELETE`).
The pair is verified against `backend`'s `POST /internal/auth/verify-project-token` (`BACKEND_INTERNAL_URL`; positive
answers cached 60 s): wrong token -> 401, `backend` unreachable -> 503 (fail closed). A job is visible only to the
`(projectId, token)` pair that created it (404 otherwise); the per-project job cap counts the verified project.

## Environment

| Variable                                                         | Default      | Meaning                                              |
| ---------------------------------------------------------------- | ------------ | ---------------------------------------------------- |
| `PORT`                                                           | 4200         | listen port                                          |
| `BACKEND_INTERNAL_URL`                                           | —            | backend internal API (files + token verification)    |
| `MEDIA_MAX_CONCURRENT_JOBS` / `MEDIA_MAX_JOBS_PER_PROJECT`       | CPUs / 2     | worker pool size / per-project active jobs           |
| `MEDIA_JOB_TIMEOUT_MS`                                           | 900000       | wall-clock limit of one ffmpeg run (killed on expiry) |
| `MEDIA_PROBE_TIMEOUT_MS`                                         | 30000        | ffprobe limit per input                              |
| `MEDIA_MAX_INPUT_BYTES`                                          | 524288000    | per-input download limit (aborted mid-stream)        |
| `MEDIA_MAX_INPUTS`                                               | 10           | inputs per job                                       |
| `MEDIA_MAX_DURATION_SECONDS`                                     | 3600         | longest accepted input (by ffprobe)                  |
| `MEDIA_OUTPUT_MAX_BYTES`, `MEDIA_FFMPEG_THREADS`, `MEDIA_WORK_DIR` | 500 MB, 2, tmp | output cap, threads, work directory                |

Inputs wider or taller than 8192 px are rejected. ffmpeg/ffprobe run with `-protocol_whitelist file,pipe` (ffmpeg:
before every `-i`); the concat demuxer uses `-safe 1` with the job's own relative file names. Input file names are
reduced to `[A-Za-z0-9._-]` basenames before they reach a path or an uploaded name.
