import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../common/errors/app-exception';
import { UsersService } from '../users/users.service';
import { AUTH_MODE_KEY, AuthMode, PERMISSIONS_KEY } from './decorators';
import { hasAllPermissions } from './permissions';
import { TokenVerifier } from './token-verifier.service';

/**
 * Global guard. Routes require a valid token unless marked @Public() or @OptionalAuth().
 * @RequirePermissions() additionally checks admin permissions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const mode = this.reflector.getAllAndOverride<AuthMode>(AUTH_MODE_KEY, targets) ?? 'required';
    if (mode === 'public') return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(req);

    if (!token) {
      if (mode === 'optional') return true;
      throw new AppException('UNAUTHENTICATED', 'Sign in required');
    }

    const claims = await this.verifier.verify(token);
    req.user = await this.users.resolveAuthUser(claims);
    this.users.touchLastSeen(req.user.id);

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (required?.length && !hasAllPermissions(req.user.permissions, required)) {
      throw new AppException('FORBIDDEN', 'You do not have permission to do this');
    }
    return true;
  }
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    throw new AppException('UNAUTHENTICATED', 'Malformed Authorization header');
  }
  return value;
}
