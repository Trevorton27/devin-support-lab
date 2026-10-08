// Service-status logic. Independent of Express so it can be tested directly.

import { timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';

export const SERVICE_NAMES = ['API Gateway', 'Billing Service', 'Webhook Service'];

// Configuration for service checks
export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_DELAY_MS = 100;

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
 * Accepts optional signal for AbortController support.
 */
export async function simulateUpstream(serviceName, options = {}) {
  // Simulate network delay for testing
  const delay = options.simulatedDelay || 0;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Simulate failures for testing
  if (options.simulatedFailure === 'timeout') {
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Longer than default timeout
  }
  if (options.simulatedFailure === 'http_error') {
    return Response.json({ error: 'simulated error' }, { status: 500 });
  }
  if (options.simulatedFailure === 'status_error') {
    return Response.json({ status: 'error' }, { status: 200 });
  }

  return Response.json({ service: serviceName, status: 'ok' }, { status: 200 });
}

/**
 * Sleep for a specified duration (used for retry delays).
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check one service against an upstream with timeout, retries, and enhanced error details.
 * Returns { name, status, latencyMs, error?, errorType?, requestCorrelationId }.
 */
export async function checkService(
  name,
  upstream = simulateUpstream,
  options = {}
) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  const requestCorrelationId = randomUUID();
  let lastError = null;
  let lastErrorType = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    let timeoutId = null;
    try {
      // Add timeout using AbortController
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await Promise.race([
        upstream(name, { signal: controller.signal }),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
          });
        }),
      ]);

      if (timeoutId) clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const error = `upstream returned HTTP ${response.status}`;
        console.warn(`[services] ${name}: ${error} (attempt ${attempt + 1}/${maxRetries + 1}, latency: ${latencyMs}ms, correlation: ${requestCorrelationId})`);
        lastError = error;
        lastErrorType = 'http_error';
        continue;
      }

      // Try to parse JSON body if present. If parsing fails (e.g., 204 No Content),
      // treat the service as healthy since the HTTP status is already 2xx.
      const body = await response.json().catch(() => null);
      if (body && body.status !== 'ok') {
        const error = `upstream reported status ${JSON.stringify(body.status)}`;
        console.warn(`[services] ${name}: ${error} (attempt ${attempt + 1}/${maxRetries + 1}, latency: ${latencyMs}ms, correlation: ${requestCorrelationId})`);
        lastError = error;
        lastErrorType = 'status_error';
        continue;
      }

      console.log(`[services] ${name}: healthy (attempt ${attempt + 1}/${maxRetries + 1}, latency: ${latencyMs}ms, correlation: ${requestCorrelationId})`);
      return {
        name,
        status: 'healthy',
        latencyMs,
        requestCorrelationId,
      };
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      lastError = err.message;
      lastErrorType = err.name === 'AbortError' ? 'timeout' : 'network_error';

      console.warn(`[services] ${name}: request failed: ${err.message} (attempt ${attempt + 1}/${maxRetries + 1}, latency: ${latencyMs}ms, correlation: ${requestCorrelationId})`);

      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt); // Exponential backoff
        console.log(`[services] ${name}: retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  console.error(`[services] ${name}: unhealthy after ${maxRetries + 1} attempts, error: ${lastError}, correlation: ${requestCorrelationId}`);
  return {
    name,
    status: 'unhealthy',
    latencyMs: null,
    error: lastError,
    errorType: lastErrorType,
    requestCorrelationId,
  };
}

/**
 * Check every service and return { services: [{ name, status, latencyMs, ... }, ...] }.
 * Options are passed through to checkService for timeout, retry, etc.
 */
export async function getServiceStatuses(upstream = simulateUpstream, options = {}) {
  const services = await Promise.all(
    SERVICE_NAMES.map((name) => checkService(name, upstream, options)),
  );
  return { services };
}
