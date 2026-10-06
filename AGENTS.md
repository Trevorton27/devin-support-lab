# Devin Support Lab - Environment Configuration

## Repository
- **GitHub**: Trevorton27/devin-support-lab
- **Type**: Node.js 22+ application
- **Purpose**: Service-monitoring dashboard for AI coding-agent and support-engineering practice

## Development Workflow Verification

### Environment Setup
- **Node.js version**: v22.22.0 (located at /home/trey27/.nvm/versions/node/v22.22.0/bin/node)
- **Dependencies**: Already installed (npm install completed successfully)
- **Verification**: npm install completes with 0 vulnerabilities

### Environment Variables
Required environment variables (see `.env.example`):
- `PORT`: Server port (default: 3000, optional)
- `SERVICE_API_KEY`: API key required for client authentication (required, no default)

**Important**: 
- Copy `.env.example` to `.env` and set `SERVICE_API_KEY` before running
- Never commit `.env` (listed in `.gitignore`)
- Do not hardcode or expose secret values in code

### Verification Commands
All verification commands must pass before committing code changes:

```bash
# Linting
npm run lint

# Testing
npm test

# Start application
npm start
```

### Current Status
- ✅ npm run lint: Passes
- ✅ npm test: Passes (9 tests)
- ✅ npm start: Successfully launches on http://localhost:3000
- ✅ Application reachable: Browser preview confirmed working

### Application Architecture
```
src/config.js     - Environment configuration (reads process.env)
src/services.js   - Business logic: API key check, simulated upstream, status checks
src/server.js     - HTTP/API layer: static files, GET /api/services, error handling
public/index.html - Client: plain HTML/CSS/JS dashboard
tests/            - Vitest tests for src/services.js (no HTTP server required)
```

### API Endpoint
`GET /api/services` with header `X-Service-API-Key: <key>`

Responses:
- 200: Key matches SERVICE_API_KEY, returns services with status, latencyMs, requestCorrelationId, and error details if unhealthy
- 401: Key missing or incorrect
- 500: SERVICE_API_KEY not configured or unexpected server error

**Reliability Features:**
- Timeout handling (5 seconds default, configurable)
- Automatic retries with exponential backoff (2 retries default)
- Latency tracking for performance monitoring
- Detailed error types: timeout, http_error, status_error, network_error
- Request correlation IDs for log tracing

### Development Scripts
- `npm start` - Start production server
- `npm run dev` - Start with --watch for development
- `npm test` - Run Vitest tests
- `npm run lint` - Run ESLint

### Security Notes
- API key is never logged or returned in responses
- Browser keeps key only in input field (not localStorage, cookies, or repository)
- Never commit secrets or credentials
