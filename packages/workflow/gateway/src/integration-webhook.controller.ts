import {
  BadRequestException,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  SetMetadata,
} from '@nestjs/common';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';

const ENVIRONMENTS = ['dev', 'prod'] as const;
type TEnvironment = (typeof ENVIRONMENTS)[number];

const isEnvironment = (value: string): value is TEnvironment => (ENVIRONMENTS as readonly string[]).includes(value);

// Matches `@falang/workflow-backend`'s `IS_PUBLIC_KEY` (`domains/auth/auth/public.decorator.ts`) by
// convention, not by import — this package can't depend on the app it's mounted into. Its
// `JwtAuthGuard` reads this exact metadata key via `Reflector` to exempt a route; if that key ever
// changes on the backend side, this must change too.
const IS_PUBLIC_KEY = 'isPublic';

/**
 * The slice of Express's `Request` this controller actually needs, kept as a local structural type
 * instead of pulling in `express`/`@types/express` as a dependency just for one annotation. `rawBody`
 * is only populated when the host app is bootstrapped with `NestFactory.create(..., { rawBody: true
 * })` (see `@falang/workflow-backend`'s `main.ts`) — see this controller's `dispatch()` doc comment
 * for why raw bytes matter here specifically.
 */
interface IRawBodyRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** Typed as `Uint8Array` (Node's `Buffer` — always what's actually there at runtime — is one) rather than `Buffer` itself: TS's DOM lib `BodyInit` doesn't structurally accept `Buffer`, only `Uint8Array`/other `BufferSource` variants. */
  readonly rawBody?: Uint8Array;
}

/**
 * Public, unauthenticated ingress — every vendor's `registerBackend`-registered webhook handler is
 * dispatched from here, not through `JwtAuthGuard` like every other route in this app. See ADR 0006's
 * dev/prod credential section for why `env` is part of the path rather than inferred. `:uri` is an
 * optional extra path segment a vendor can use to expose more than one distinct webhook endpoint per
 * credential (most vendors, like Telegram, register a single handler under `''`).
 */
@Controller('webhooks')
export class IntegrationWebhookController {
  private readonly runtime: IntegrationsRuntimeService;

  constructor(@Inject(IntegrationsRuntimeService) runtime: IntegrationsRuntimeService) {
    this.runtime = runtime;
  }

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Post(':vendor/:projectId/:credentialId/:env')
  handleRoot(
    @Param('vendor') vendor: string,
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @Param('env') env: string,
    @Req() req: IRawBodyRequest,
  ): Promise<{ status: number }> {
    return this.dispatch(vendor, projectId, credentialId, env, '', req);
  }

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Post(':vendor/:projectId/:credentialId/:env/:uri')
  handleWithUri(
    @Param('vendor') vendor: string,
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @Param('env') env: string,
    @Param('uri') uri: string,
    @Req() req: IRawBodyRequest,
  ): Promise<{ status: number }> {
    return this.dispatch(vendor, projectId, credentialId, env, uri, req);
  }

  /**
   * Reconstructs a standard Fetch `Request` for `registerBackend` handlers out of the *raw* incoming
   * bytes and the original `content-type` header — not, as this used to, out of whatever NestJS's
   * `@Body()` had already parsed and this then re-`JSON.stringify`'d. That earlier shape silently
   * broke any vendor whose real wire format isn't JSON (Bitrix24's `application/x-www-form-urlencoded`
   * outgoing webhook, notably — see ADR 0017 (private)'s "A
   * real gap found along the way" section): Express's body-parser middleware had already decoded the
   * form body into a nested JS object by the time `@Body()` saw it, and re-serializing *that* as JSON
   * is not the same bytes `parseBracketFormBody` expects to parse. `rawBody` (populated only because
   * `main.ts` bootstraps with `NestFactory.create(..., { rawBody: true })`) is the same bytes the
   * sender actually transmitted, regardless of `content-type` — every vendor's own handler decides how
   * to interpret them, exactly as it would running behind a real HTTP server.
   *
   * Still doesn't forward the caller's real IP or every original header (only `content-type`) — no
   * vendor's handler needs more than that today, and the IP half specifically needs this host's
   * `trust proxy`/k8s-ingress configuration sorted out first (see the ADR section above). Left as a
   * separate follow-up rather than folded in here.
   */
  private async dispatch(
    vendor: string,
    projectId: string,
    credentialId: string,
    env: string,
    uri: string,
    req: IRawBodyRequest,
  ): Promise<{ status: number }> {
    if (!isEnvironment(env)) throw new BadRequestException(`Invalid env "${env}", expected "dev" or "prod"`);
    const handler = this.runtime.findWebhookHandler(vendor, projectId, credentialId, env, uri);
    if (!handler) {
      throw new NotFoundException(`No webhook handler registered for ${vendor}/${projectId}/${credentialId}/${env}`);
    }
    const contentType = req.headers['content-type'];
    const contentTypeHeader = Array.isArray(contentType) ? contentType[0] : contentType;
    const requestInit: RequestInit = {
      method: 'POST',
      // `Uint8Array` genuinely is a valid `BodyInit` at runtime (verified directly against Node's
      // built-in `fetch`/`Request`) — the cast below works around `undici-types`' `BodyInit` union
      // not yet accounting for TS's newer generic `Uint8Array<TArrayBuffer>`, a lib-version typing
      // gap, not an actual type mismatch.
      body: req.rawBody as BodyInit | undefined,
    };
    if (contentTypeHeader) requestInit.headers = { 'content-type': contentTypeHeader };
    const request = new Request('http://internal.invalid/', requestInit);
    const response = await handler(request);
    return { status: response.status };
  }
}
