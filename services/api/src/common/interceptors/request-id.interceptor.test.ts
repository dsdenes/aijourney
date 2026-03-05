import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestIdInterceptor } from './request-id.interceptor';
import { of, firstValueFrom } from 'rxjs';

function createMockContext(requestId?: string) {
  const headers: Record<string, string> = {};
  if (requestId) {
    headers['x-request-id'] = requestId;
  }

  const setHeader = vi.fn();
  const request = { headers };
  const response = { setHeader };

  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any,
    request,
    response,
    setHeader,
  };
}

describe('RequestIdInterceptor', () => {
  let interceptor: RequestIdInterceptor;
  const mockHandler = { handle: () => of('result') };

  beforeEach(() => {
    interceptor = new RequestIdInterceptor();
  });

  it('should generate a ULID request ID if none provided', async () => {
    const { context, request, setHeader } = createMockContext();

    await firstValueFrom(interceptor.intercept(context, mockHandler));

    expect(request.headers['x-request-id']).toBeDefined();
    expect(request.headers['x-request-id'].length).toBeGreaterThan(10);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', request.headers['x-request-id']);
  });

  it('should preserve existing x-request-id header', async () => {
    const { context, request, setHeader } = createMockContext('my-custom-id');

    await firstValueFrom(interceptor.intercept(context, mockHandler));

    expect(request.headers['x-request-id']).toBe('my-custom-id');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'my-custom-id');
  });

  it('should set the x-request-id on the response', async () => {
    const { context, setHeader } = createMockContext();

    await firstValueFrom(interceptor.intercept(context, mockHandler));

    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader.mock.calls[0][0]).toBe('x-request-id');
  });

  it('should call next.handle()', async () => {
    const { context } = createMockContext();
    const spy = vi.fn().mockReturnValue(of('ok'));
    const handler = { handle: spy };

    await firstValueFrom(interceptor.intercept(context, handler));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
