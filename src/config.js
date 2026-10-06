// Central application configuration.
// This is the only module that reads process.env.

// Load variables from a local .env file if one exists. Variables already set
// in the shell take precedence over values in the file.
try {
  process.loadEnvFile();
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  // No default on purpose: the API refuses requests until this is configured.
  serviceApiKey: process.env.SERVICE_API_KEY || undefined,
});
