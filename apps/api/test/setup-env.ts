// Runs in every test worker before modules load. Integration tests NEVER use .env.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://reeldrama:reeldrama@localhost:54329/reeldrama_test';
process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
process.env.DEV_JWT_SECRET = 'e2e-dev-secret-'.padEnd(48, 'x');
process.env.LOG_LEVEL = 'error';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_JWKS_URL = '';
process.env.SUPABASE_JWT_SECRET = '';
process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.test/public';
