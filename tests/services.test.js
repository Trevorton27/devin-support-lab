import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_NOT_CONFIGURED,
  AUTH_OK,
  AUTH_UNAUTHORIZED,
  checkApiKey,
  checkService,
  getServiceStatuses,
  simulateUpstream,
} from '../src/services.js';

// Silence expected warnings from unhealthy-service tests.
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const healthyUpstream = async () => Response.json({ status: 'ok' });
const failingUpstream = async () => Response.json({ error: 'boom' }, { status: 500 });
const noContentUpstream = async () => new Response(null, { status: 204 });

describe('checkApiKey', () => {
  it('accepts a matching key', () => {
    expect(checkApiKey('test-key', 'test-key')).toBe(AUTH_OK);
  });

  it('rejects an incorrect key', () => {
    expect(checkApiKey('wrong-key', 'test-key')).toBe(AUTH_UNAUTHORIZED);
  });

  it('rejects a missing key', () => {
    expect(checkApiKey(undefined, 'test-key')).toBe(AUTH_UNAUTHORIZED);
    expect(checkApiKey('', 'test-key')).toBe(AUTH_UNAUTHORIZED);
  });

  it('reports a configuration error when no key is configured', () => {
    expect(checkApiKey('test-key', undefined)).toBe(AUTH_NOT_CONFIGURED);
  });
});

describe('checkService', () => {
  it('reports healthy for a healthy upstream response', async () => {
    const result = await checkService('API Gateway', healthyUpstream);
    expect(result).toMatchObject({
      name: 'API Gateway',
      status: 'healthy',
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.requestCorrelationId).toBeDefined();
  });

  it('reports unhealthy for an HTTP 500 upstream response', async () => {
    const result = await checkService('Billing Service', failingUpstream, { maxRetries: 0 });
    expect(result).toMatchObject({
      name: 'Billing Service',
      status: 'unhealthy',
      errorType: 'http_error',
    });
    expect(result.latencyMs).toBeNull();
    expect(result.error).toContain('HTTP 500');
  });

  it('reports healthy with the default simulated upstream', async () => {
    const result = await checkService('Webhook Service', simulateUpstream);
    expect(result).toMatchObject({
      name: 'Webhook Service',
      status: 'healthy',
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports healthy for HTTP 204 No Content responses', async () => {
    const result = await checkService('API Gateway', noContentUpstream);
    expect(result).toMatchObject({
      name: 'API Gateway',
      status: 'healthy',
    });
  });

  it('handles timeout when upstream takes too long', async () => {
    const slowUpstream = async (name, options) => {
      if (options?.signal) {
        await new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new Error('Aborted'));
          });
          setTimeout(resolve, 10000);
        });
      }
      return Response.json({ status: 'ok' });
    };
    const result = await checkService('Slow Service', slowUpstream, {
      timeoutMs: 100,
      maxRetries: 0,
    });
    expect(result).toMatchObject({
      name: 'Slow Service',
      status: 'unhealthy',
    });
    expect(result.error).toBeDefined();
  });

  it('retries on transient failures with exponential backoff', async () => {
    let attemptCount = 0;
    const flakyUpstream = async () => {
      attemptCount++;
      if (attemptCount < 2) {
        return Response.json({ error: 'temp' }, { status: 500 });
      }
      return Response.json({ status: 'ok' });
    };
    const result = await checkService('Flaky Service', flakyUpstream, {
      maxRetries: 2,
      retryDelayMs: 10,
    });
    expect(result).toMatchObject({
      name: 'Flaky Service',
      status: 'healthy',
    });
    expect(attemptCount).toBe(2);
  });

  it('gives up after max retries', async () => {
    const alwaysFailingUpstream = async () =>
      Response.json({ error: 'always' }, { status: 500 });
    const result = await checkService('Failing Service', alwaysFailingUpstream, {
      maxRetries: 1,
      retryDelayMs: 10,
    });
    expect(result).toMatchObject({
      name: 'Failing Service',
      status: 'unhealthy',
      errorType: 'http_error',
    });
  });
});

describe('getServiceStatuses', () => {
  it('returns all services as healthy by default', async () => {
    const result = await getServiceStatuses();
    expect(result.services).toHaveLength(3);
    result.services.forEach((service) => {
      expect(service).toMatchObject({
        status: 'healthy',
      });
      expect(service.latencyMs).toBeGreaterThanOrEqual(0);
      expect(service.requestCorrelationId).toBeDefined();
    });
  });

  it('returns a mix of statuses when one upstream fails', async () => {
    const upstream = (name) =>
      name === 'Billing Service' ? failingUpstream() : healthyUpstream();

    const result = await getServiceStatuses(upstream, { maxRetries: 0 });
    expect(result.services).toHaveLength(3);
    expect(result.services[0]).toMatchObject({
      name: 'API Gateway',
      status: 'healthy',
    });
    expect(result.services[1]).toMatchObject({
      name: 'Billing Service',
      status: 'unhealthy',
    });
    expect(result.services[2]).toMatchObject({
      name: 'Webhook Service',
      status: 'healthy',
    });
  });
});
