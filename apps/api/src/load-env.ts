import { existsSync } from 'node:fs';

// Imported first by main.ts so .env is loaded before any module reads process.env.
if (existsSync('.env')) process.loadEnvFile('.env');
