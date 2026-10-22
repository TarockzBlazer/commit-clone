import { HttpException } from '@nestjs/common';
import { RATE_LIMIT_KEY, RateLimitGuard } from './rate-limit.guard';

class TestController {}

function contextFor(handler: Function, ip = '127.0.0.1'): any {
  const response = { setHeader: jest.fn() };
  return {
    getClass: () => TestController,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        method: 'POST',
        route: { path: '/auth/login' },
        url: '/auth/login',
      }),
      getResponse: () => response,
    }),
    response,
  };
}

describe('RateLimitGuard', () => {
  it('allows requests up to the limit and returns 429 afterwards', () => {
    const handler = () => {};
    Reflect.defineMetadata(
      RATE_LIMIT_KEY,
      { windowMs: 60_000, max: 2 },
      handler,
    );

    const guard = new RateLimitGuard();
    const context = contextFor(handler);

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(context.response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(String),
    );
  });

  it('does not limit handlers without a rule', () => {
    const guard = new RateLimitGuard();
    expect(guard.canActivate(contextFor(() => {}))).toBe(true);
  });

  it('keeps separate buckets per IP', () => {
    const handler = () => {};
    Reflect.defineMetadata(
      RATE_LIMIT_KEY,
      { windowMs: 60_000, max: 1 },
      handler,
    );

    const guard = new RateLimitGuard();
    expect(guard.canActivate(contextFor(handler, '10.0.0.1'))).toBe(true);
    expect(guard.canActivate(contextFor(handler, '10.0.0.2'))).toBe(true);
    expect(() => guard.canActivate(contextFor(handler, '10.0.0.1'))).toThrow(
      HttpException,
    );
  });
});
