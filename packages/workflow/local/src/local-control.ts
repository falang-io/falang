import { Controller, ForbiddenException, Headers, HttpCode, Inject, NotFoundException, Post } from '@nestjs/common';
import { AuthService, Public, UsersService } from '@falang/workflow-backend';
import { timingSafeEqual } from 'node:crypto';

export const LOCAL_CONTROL_OPTIONS = Symbol('LOCAL_CONTROL_OPTIONS');

export interface ILocalControlOptions {
  /** Per-run secret; `null` = the control routes are off (404). */
  readonly token: string | null;
  readonly onShutdownRequested: () => void;
}

export type TControlTokenCheck = 'ok' | 'forbidden' | 'not-found';

/** The whole authorization rule of the control routes: no configured token = the routes do not exist. */
export const checkControlToken = (expected: string | null, provided: string | undefined): TControlTokenCheck => {
  if (expected === null) return 'not-found';
  if (typeof provided !== 'string') return 'forbidden';
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'forbidden';
};

const assertAllowed = (expected: string | null, provided: string | undefined): void => {
  const result = checkControlToken(expected, provided);
  if (result === 'not-found') throw new NotFoundException();
  if (result === 'forbidden') throw new ForbiddenException();
};

/**
 * Routes for the Electron shell (ADR 0072, private). They live under `/internal/`, so the backend's port split serves
 * them on the internal (loopback) port only; on top of that they need the per-run `x-local-control-token`.
 */
@Public()
@Controller('internal/local')
export class LocalControlController {
  private readonly options: ILocalControlOptions;
  private readonly authService: AuthService;
  private readonly usersService: UsersService;

  constructor(
    @Inject(LOCAL_CONTROL_OPTIONS) options: ILocalControlOptions,
    @Inject(AuthService) authService: AuthService,
    @Inject(UsersService) usersService: UsersService,
  ) {
    this.options = options;
    this.authService = authService;
    this.usersService = usersService;
  }

  /** An access token for the seeded `admin` user — the shell signs the window in with it. */
  @Post('auto-login')
  @HttpCode(200)
  async autoLogin(@Headers('x-local-control-token') provided?: string): Promise<{ accessToken: string }> {
    assertAllowed(this.options.token, provided);
    const admin = await this.usersService.findByUsername('admin');
    if (!admin) throw new NotFoundException('The seeded admin user does not exist');
    const { accessToken } = await this.authService.login(admin);
    return { accessToken };
  }

  /** The cross-platform way to quit: a signal would be an immediate TerminateProcess on Windows and orphan the children. */
  @Post('shutdown')
  @HttpCode(202)
  shutdown(@Headers('x-local-control-token') provided?: string): { ok: true } {
    assertAllowed(this.options.token, provided);
    setImmediate(() => this.options.onShutdownRequested());
    return { ok: true };
  }
}
