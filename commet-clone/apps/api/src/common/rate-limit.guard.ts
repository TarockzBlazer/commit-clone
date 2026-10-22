import 'reflect-metadata';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export const RATE_LIMIT_KEY = 'rate-limit';

/** Marks a handler with its own fixed-window rate limit. */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface Hit {
  count: number;
  resetAt: number;
}

/**
 * Small in-process fixed-window limiter. It is intentionally dependency-free:
 * enough to stop password guessing and invite-code probing on a single node.
 * If the API is ever horizontally scaled, move the counters to Redis.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, Hit>();
  private lastSweep = Date.now();

  canActivate(context: ExecutionContext): boolean {
    const options = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) as RateLimitOptions | undefined;
    if (!options) return true;

    const http = context.switchToHttp();
    const request = http.getRequest();
    const now = Date.now();

    // Drop expired buckets occasionally so a long-running process does not
    // grow the map forever.
    if (now - this.lastSweep > 60_000) {
      for (const [key, hit] of this.hits) {
        if (hit.resetAt <= now) this.hits.delete(key);
      }
      this.lastSweep = now;
    }

    // Key by handler, not by URL: otherwise each invite code would get its own
    // bucket and the limiter would be useless for code probing.
    const key = `${request.ip ?? 'unknown'}|${context.getClass().name}|${
      context.getHandler().name
    }`;
    const hit = this.hits.get(key);

    if (!hit || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    hit.count += 1;
    if (hit.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
      http.getResponse()?.setHeader?.('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
