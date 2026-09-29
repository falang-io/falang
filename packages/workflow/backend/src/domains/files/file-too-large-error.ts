/** Thrown by `FilesService.upload`'s own size/quota guard `Transform` when the stream itself runs over the per-file or per-project limit — never reaches a caller, `upload()` catches it right where it's thrown and turns it into a `PayloadTooLargeException`. */
export class FileTooLargeError extends Error {}
