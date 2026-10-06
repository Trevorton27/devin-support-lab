// Service-status logic. Independent of Express so it can be tested directly.

import { timingSafeEqual } from 'node:crypto';

export const SERVICE_NAMES = ['API Gateway', 'Billing Service', 'Webhook Service'];

// Possible results of checkApiKey().
export const AUTH_OK = 'ok';
export const AUTH_UNAUTHORIZED = 'unauthorized';
export const AUTH_NOT_CONFIGURED = 'not_configured';

/**
 * Compare the key sent by the client with the configured key.
 * Returns AUTH_OK, AUTH_UNAUTHORIZED, or AUTH_NOT_CONFIGURED.
 */
export function checkApiKey(providedKey, expectedKey) {
  if (!expectedKey) return AUTH_NOT_CONFIGURED;
  if (!providedKey) return AUTH_UNAUTHORIZED;

  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);
  if (provided.length !== expected.length) return AUTH_UNAUTHORIZED;

  return timingSafeEqual(provided, expected) ? AUTH_OK : AUTH_UNAUTHORIZED;
}

/**
 * Simulated upstream health endpoint. Returns a standard fetch Response,
 * exactly as `await fetch(url)` would, so a real HTTP call could replace it.
 */
export async function simulateUpstream(serviceName) {
  return Response.json({ service: serviceName, status: 'ok' }, { status: 200 });
}

/**
 * Check one service against an upstream and return { name, status },
 * where status is 'healthy' or 'unhealthy'.
 */
export async function checkService(name, upstream = simulateUpstream) {
  try {
    const response = await upstream(name);

    if (!response.ok) {
      console.warn(`[services] ${name}: upstream returned HTTP ${response.status}`);
      return { name, status: 'unhealthy' };
    }

    // Try to parse JSON body if present. If parsing fails (e.g., 204 No Content),
    // treat the service as healthy since the HTTP status is already 2xx.
    const body = await response.json().catch(() => null);
    if (body && body.status !== 'ok') {
      console.warn(`[services] ${name}: upstream reported status ${JSON.stringify(body.status)}`);
      return { name, status: 'unhealthy' };
    }

    return { name, status: 'healthy' };
  } catch (err) {
    console.warn(`[services] ${name}: upstream request failed: ${err.message}`);
    return { name, status: 'unhealthy' };
  }
}

/**
 * Check every service and return { services: [{ name, status }, ...] }.
 */
export async function getServiceStatuses(upstream = simulateUpstream) {
  const services = await Promise.all(
    SERVICE_NAMES.map((name) => checkService(name, upstream)),
  );
  return { services };
}
