/** ffmpeg's `-protocol_whitelist` is an *input* option: it applies only to the `-i` that follows
 * it. Every `-i` therefore gets its own copy, so no input (or concat-list entry reached through
 * it) can open `http:`/`tcp:`/etc. */
export const withProtocolWhitelist = (argv: readonly string[]): readonly string[] =>
  argv.flatMap((arg) => (arg === '-i' ? ['-protocol_whitelist', 'file,pipe', '-i'] : [arg]));
