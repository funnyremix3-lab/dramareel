import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ENV, Env } from '../config/env';

export interface RtdnAuthVerifier {
  /** True when the request carries a valid Google-signed OIDC token for our push subscription. */
  verify(authorizationHeader: string | undefined): Promise<boolean>;
}

export const RTDN_AUTH = Symbol('RTDN_AUTH');

/** Pub/Sub push authentication: OIDC token signed by Google for the configured service account. */
@Injectable()
export class GoogleOidcRtdnAuth implements RtdnAuthVerifier {
  private readonly jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

  constructor(@Inject(ENV) private readonly env: Env) {}

  async verify(header: string | undefined): Promise<boolean> {
    if (!header?.startsWith('Bearer ') || !this.env.GOOGLE_RTDN_AUDIENCE || !this.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL) return false;
    try {
      const { payload } = await jwtVerify(header.slice(7), this.jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.env.GOOGLE_RTDN_AUDIENCE,
      });
      return payload.email === this.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL && payload.email_verified === true;
    } catch {
      return false;
    }
  }
}
