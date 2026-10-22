import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, decodeProtectedHeader, JWTPayload, jwtVerify } from 'jose';
import { AppException } from '../common/errors/app-exception';
import { ENV, Env } from '../config/env';
import { VerifiedClaims } from './auth.types';

export const DEV_TOKEN_ISSUER = 'reel-drama-dev';
const AUDIENCE = 'authenticated';

/**
 * Verifies Supabase access tokens (asymmetric via JWKS, or legacy HS256 secret) and,
 * outside production, HS256 tokens from the local dev issuer.
 */
@Injectable()
export class TokenVerifier {
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly supabaseIssuer?: string;
  private readonly supabaseSecret?: Uint8Array;
  private readonly devSecret?: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    const encoder = new TextEncoder();
    if (env.SUPABASE_JWKS_URL) this.jwks = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL));
    if (env.SUPABASE_URL) this.supabaseIssuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
    if (env.SUPABASE_JWT_SECRET) this.supabaseSecret = encoder.encode(env.SUPABASE_JWT_SECRET);
    if (env.DEV_JWT_SECRET && env.NODE_ENV !== 'production') this.devSecret = encoder.encode(env.DEV_JWT_SECRET);
  }

  async verify(token: string): Promise<VerifiedClaims> {
    let payload: JWTPayload;
    try {
      payload = await this.verifyPayload(token);
    } catch (err) {
      if (err instanceof AppException) throw err;
      throw new AppException('UNAUTHENTICATED', 'Invalid or expired token');
    }
    if (!payload.sub) throw new AppException('UNAUTHENTICATED', 'Token has no subject');
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      phone: typeof payload.phone === 'string' && payload.phone ? payload.phone : undefined,
    };
  }

  private async verifyPayload(token: string): Promise<JWTPayload> {
    const { alg } = decodeProtectedHeader(token);

    if (alg === 'HS256') {
      if (this.devSecret) {
        const dev = await jwtVerify(token, this.devSecret, {
          algorithms: ['HS256'],
          issuer: DEV_TOKEN_ISSUER,
          audience: AUDIENCE,
        }).catch(() => null);
        if (dev) return dev.payload;
      }
      if (this.supabaseSecret) {
        const { payload } = await jwtVerify(token, this.supabaseSecret, {
          algorithms: ['HS256'],
          issuer: this.supabaseIssuer,
          audience: AUDIENCE,
        });
        return payload;
      }
      throw new AppException('UNAUTHENTICATED', 'Invalid or expired token');
    }

    if (!this.jwks) throw new AppException('UNAUTHENTICATED', 'Token verification is not configured');
    const { payload } = await jwtVerify(token, this.jwks, {
      algorithms: ['ES256', 'RS256'],
      issuer: this.supabaseIssuer,
      audience: AUDIENCE,
    });
    return payload;
  }
}
