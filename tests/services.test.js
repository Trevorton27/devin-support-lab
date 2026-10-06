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

const healthyUpstream = async () => Response.json({ status: 'ok' });
const failingUpstream = async () => Response.json({ error: 'boom' }, { status: 500 });

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
    expect(await checkService('API Gateway', healthyUpstream)).toEqual({
      name: 'API Gateway',
      status: 'healthy',
    });
  });

  it('reports unhealthy for an HTTP 500 upstream response', async () => {
    expect(await checkService('Billing Service', failingUpstream)).toEqual({
      name: 'Billing Service',
      status: 'unhealthy',
    });
  });

  it('reports healthy with the default simulated upstream', async () => {
    expect(await checkService('Webhook Service', simulateUpstream)).toEqual({
      name: 'Webhook Service',
      status: 'healthy',
    });
  });
});

describe('getServiceStatuses', () => {
  it('returns all services as healthy by default', async () => {
    expect(await getServiceStatuses()).toEqual({
      services: [
        { name: 'API Gateway', status: 'healthy' },
        { name: 'Billing Service', status: 'healthy' },
        { name: 'Webhook Service', status: 'healthy' },
      ],
    });
  });

  it('returns a mix of statuses when one upstream fails', async () => {
    const upstream = (name) =>
      name === 'Billing Service' ? failingUpstream() : healthyUpstream();

    expect(await getServiceStatuses(upstream)).toEqual({
      services: [
        { name: 'API Gateway', status: 'healthy' },
        { name: 'Billing Service', status: 'unhealthy' },
        { name: 'Webhook Service', status: 'healthy' },
      ],
    });
  });
});
