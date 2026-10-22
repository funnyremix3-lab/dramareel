import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limits per signed-in user (falls back to IP for anonymous requests), so many users
 * behind one carrier NAT or Wi-Fi do not share a bucket. Registered after AuthGuard.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    return user?.id ? `user:${user.id}` : `ip:${String(req.ip)}`;
  }
}
