import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface ILaunchedOAuth2Flow {
  /** The vendor's consent URL the launch route redirected to. */
  readonly vendorUrl: URL;
  readonly state: string;
  /** `Cookie` header value that a callback request must carry (the browser-binding nonce). */
  readonly cookie: string;
}

/** Plays the popup's first hop: opens `/oauth2/launch/:id` (the `authorizeUrl` returned by `start`) and keeps the nonce cookie. */
export const launchOAuth2 = async (app: INestApplication, launchUrl: string): Promise<ILaunchedOAuth2Flow> => {
  const response = await request(app.getHttpServer()).get(new URL(launchUrl).pathname);
  if (response.status !== 302) throw new Error(`expected a redirect from the launch route, got ${response.status}`);
  const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = (setCookie ?? []).map((entry) => entry.split(';')[0]).join('; ');
  const vendorUrl = new URL(response.headers['location'] as string);
  return { vendorUrl, state: vendorUrl.searchParams.get('state') ?? '', cookie };
};
