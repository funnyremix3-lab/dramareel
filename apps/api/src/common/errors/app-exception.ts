import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'ACCOUNT_SUSPENDED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'EPISODE_LOCKED'
  | 'INSUFFICIENT_COINS'
  | 'REWARD_NOT_ELIGIBLE'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'PAYMENTS_DISABLED'
  | 'ASSET_NOT_READY'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  EPISODE_LOCKED: HttpStatus.FORBIDDEN,
  INSUFFICIENT_COINS: HttpStatus.CONFLICT,
  REWARD_NOT_ELIGIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  PAYMENT_VERIFICATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  PAYMENTS_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  ASSET_NOT_READY: HttpStatus.CONFLICT,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Domain error with a stable machine-readable code (see docs/api.md). */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, STATUS[code]);
  }
}

export const notFound = (what: string) => new AppException('NOT_FOUND', `${what} not found`);
