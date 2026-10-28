import { zod } from '@falang/dto';

// zod 4 compiles object parsers with `new Function` unless told not to, probing for it with a bare
// `Function('')`. The production client's CSP has no 'unsafe-eval', so that probe is reported as a CSP
// violation on every page (and, once the policy is enforced, blocked — zod would then fall back to the
// same non-JIT path silently). Switch the JIT off up front so the browser never evaluates code.
// Imported first by this package's index, so it runs before any schema is parsed; Node hosts that
// import deep paths (headless agent factories, backend) keep the JIT.
zod.config({ jitless: true });
