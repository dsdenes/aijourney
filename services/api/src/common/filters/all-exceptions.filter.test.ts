import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createMockHost(overrides: Partial<{ url: string }> = {}) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const request = {
    headers: {},
    method: 'GET',
    url: overrides.url ?? '/test',
  };

  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as any,
    response,
    request,
    json,
    status,
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('should handle HttpException with string response', () => {
    const { host, status, json } = createMockHost();
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'Not Found',
          statusCode: 404,
          path: '/test',
        }),
      }),
    );
  });

  it('should handle HttpException with object response', () => {
    const { host, status, json } = createMockHost();
    const exception = new HttpException(
      { message: 'Validation failed', code: 'VALIDATION' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION',
          message: 'Validation failed',
          statusCode: 400,
        }),
      }),
    );
  });

  it('should handle generic Error as 500', () => {
    const { host, status, json } = createMockHost({ url: '/api/users' });
    const exception = new Error('DB connection failed');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'DB connection failed',
          statusCode: 500,
          path: '/api/users',
        }),
      }),
    );
  });

  it('should handle non-Error unknown exceptions as 500', () => {
    const { host, status, json } = createMockHost();

    filter.catch('something unexpected', host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          statusCode: 500,
        }),
      }),
    );
  });

  it('should include ISO timestamp in response', () => {
    const { host, json } = createMockHost();

    filter.catch(new Error('test'), host);

    const response = json.mock.calls[0][0];
    const ts = new Date(response.error.timestamp);
    expect(ts.toISOString()).toBe(response.error.timestamp);
  });

  it('should include request path in error response', () => {
    const { host, json } = createMockHost({ url: '/api/journeys/123' });

    filter.catch(new Error('not found'), host);

    const response = json.mock.calls[0][0];
    expect(response.error.path).toBe('/api/journeys/123');
  });

  it('should default request id when headers are missing', () => {
    const { host, json, request } = createMockHost();
    delete (request as { headers?: Record<string, string> }).headers;

    filter.catch(new Error('test'), host);

    const response = json.mock.calls[0][0];
    expect(response.error.requestId).toBe('unknown');
  });
});
