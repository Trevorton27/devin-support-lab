# Devin Support Lab

A small training application for practicing AI coding-agent and support-engineering workflows: repository onboarding, environment configuration, secrets, debugging, testing, and agent troubleshooting.

It is a tiny service-monitoring dashboard. The browser shows the status of three simulated services, fetched from an Express API that requires an API key. The codebase is kept deliberately small so it can be broken and repaired in controlled exercises.

## Architecture

```text
src/config.js     Environment configuration (the only file that reads process.env)
src/services.js   Business logic: API key check, simulated upstream, status checks
src/server.js     HTTP/API layer: static files, GET /api/services, error handling
public/index.html Client: plain HTML/CSS/JS dashboard
tests/            Vitest tests for src/services.js (no HTTP server required)
```

### API

`GET /api/services` with the header `X-Service-API-Key: <key>`.

| Situation                          | Response                                        |
| ---------------------------------- | ----------------------------------------------- |
| Key matches `SERVICE_API_KEY`      | `200` `{ "services": [{ "name", "status" }] }`  |
| Key missing or incorrect           | `401` `{ "error": "Unauthorized" }`             |
| `SERVICE_API_KEY` not configured   | `500` `{ "error": "Server configuration error" }` |
| Unexpected server error            | `500` `{ "error": "Internal server error" }`    |

Each service `status` is either `healthy` or `unhealthy`. A service is `unhealthy` when its upstream returns a non-2xx response, a body whose `status` is not `"ok"`, an unparseable body, or throws. The reason is logged to the server console as a `[services]` warning.

Upstream services are simulated by `simulateUpstream()` in `src/services.js`, which returns a standard fetch `Response`. No external network calls are made.

## Requirements

```text
Node.js >= 22
npm
```

## Installation

```bash
npm install
```

## Configuration

```bash
cp .env.example .env
```

Then edit `.env` and set `SERVICE_API_KEY` to a value of your choice. It is required: there is no default, and the API returns `500 Server configuration error` until it is set.

| Variable          | Required | Default | Purpose                                         |
| ----------------- | -------- | ------- | ----------------------------------------------- |
| `PORT`            | No       | `3000`  | Port the server listens on                      |
| `SERVICE_API_KEY` | Yes      | none    | Key clients must send in `X-Service-API-Key`    |

`.env` is loaded automatically on startup if present. Variables set in the shell take precedence over `.env`. Never commit `.env`; it is listed in `.gitignore`.

## Running

```bash
npm start
```

Then open http://localhost:3000.

## Development

```bash
npm run dev
```

Runs the server with `node --watch`, restarting on file changes.

## Testing

```bash
npm test
```

## Linting

```bash
npm run lint
```

## Verification

1. Configure `SERVICE_API_KEY` in `.env` (for example `SERVICE_API_KEY=dev-secret-123`).
2. Start the application: `npm start`.
3. Open http://localhost:3000 in a browser.
4. Enter the same API key in the "Service API key" field.
5. Click **Refresh Status**.
6. Confirm all three services report **Healthy**.
7. Run the tests: `npm test`.
8. Run the linter: `npm run lint`.

You can also check the API with curl:

```bash
curl \
  -H "X-Service-API-Key: dev-secret-123" \
  http://localhost:3000/api/services
```

`dev-secret-123` is a local demonstration value only. Use whatever value you configured as `SERVICE_API_KEY` locally, and never use this example value in a real environment.

A wrong key should return `401`:

```bash
curl -i -H "X-Service-API-Key: wrong" http://localhost:3000/api/services
```

## Security notes

- The configured API key is never logged or returned in responses.
- The browser keeps the key only in the input field for the current page; it is not stored in localStorage, cookies, or the repository.
