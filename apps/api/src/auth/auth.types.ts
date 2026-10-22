export interface VerifiedClaims {
  sub: string;
  email?: string;
  phone?: string;
  /** Token issue time (unix seconds), used to tell a fresh sign-in from an old session. */
  issuedAt?: number;
}

/** The authenticated principal attached to `request.user`. */
export interface AuthUser {
  id: string;
  authProviderId: string;
  roles: string[];
  permissions: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
