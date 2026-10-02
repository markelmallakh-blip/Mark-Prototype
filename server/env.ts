// Imported first by server/index.ts so every other module sees .env values.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env — defaults apply
}
