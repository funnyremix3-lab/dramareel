import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from './auth.types';

export const AUTH_MODE_KEY = 'authMode';
export type AuthMode = 'required' | 'optional' | 'public';

/** No token needed; any token sent is ignored. */
export const Public = () => SetMetadata(AUTH_MODE_KEY, 'public' satisfies AuthMode);
/** Token optional; when present and valid the response is personalised. */
export const OptionalAuth = () => SetMetadata(AUTH_MODE_KEY, 'optional' satisfies AuthMode);

export const PERMISSIONS_KEY = 'permissions';
/** Requires every listed admin permission (see hasPermission). */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<Request>().user;
});
