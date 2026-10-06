// HTTP/API layer. Business logic lives in services.js.

import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import {
  AUTH_NOT_CONFIGURED,
  AUTH_OK,
  checkApiKey,
  getServiceStatuses,
} from './services.js';

const app = express();

app.use(express.static(path.join(import.meta.dirname, '..', 'public')));

app.get('/api/services', async (req, res) => {
  const auth = checkApiKey(req.get('X-Service-API-Key'), config.serviceApiKey);

  if (auth === AUTH_NOT_CONFIGURED) {
    console.error('[server] SERVICE_API_KEY is not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (auth !== AUTH_OK) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json(await getServiceStatuses());
});

// Express 5 forwards rejected async handlers here.
app.use((err, req, res, _next) => {
  console.error('[server] Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`[server] Devin Support Lab listening on http://localhost:${config.port}`);
  if (!config.serviceApiKey) {
    console.warn('[server] SERVICE_API_KEY is not set; /api/services will return 500');
  }
});
