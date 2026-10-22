# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t reel-drama-api .
# Run migrations as a separate one-off step before rolling out:
#   docker run --rm --env-file api.env reel-drama-api npx prisma migrate deploy
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY apps/api/package.json apps/api/package-lock.json ./
COPY apps/api/prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
RUN npm run build

FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY apps/api/package.json apps/api/package-lock.json ./
COPY apps/api/prisma ./prisma
# Production deps plus the Prisma CLI for `migrate deploy`.
RUN npm ci --omit=dev --no-audit --no-fund && npm install --no-save --no-audit --no-fund prisma@6.16.2 && npx prisma generate

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY apps/api/package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://localhost:3000/api/v1/health/live || exit 1
CMD ["node", "dist/main.js"]
