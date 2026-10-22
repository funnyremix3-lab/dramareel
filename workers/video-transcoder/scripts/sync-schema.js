// Copies the API's Prisma schema next to this package so `prisma generate` emits the client into
// this package's node_modules. apps/api/prisma/schema.prisma remains the single source of truth.
const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

mkdirSync(join(__dirname, '..', 'prisma'), { recursive: true });
copyFileSync(join(__dirname, '..', '..', '..', 'apps', 'api', 'prisma', 'schema.prisma'), join(__dirname, '..', 'prisma', 'schema.prisma'));
