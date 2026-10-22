# Build from the repository root:
#   docker build -f workers/notifications/Dockerfile -t reel-drama-notifications .
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY workers/notifications/package.json workers/notifications/package-lock.json workers/notifications/
COPY workers/notifications/scripts workers/notifications/scripts
WORKDIR /app/workers/notifications
RUN npm ci --no-audit --no-fund
COPY workers/notifications/tsconfig.json workers/notifications/tsconfig.build.json ./
COPY workers/notifications/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/workers/notifications/node_modules ./node_modules
COPY --from=build /app/workers/notifications/dist ./dist
COPY --from=build /app/workers/notifications/package.json ./
USER node
CMD ["node", "dist/src/main.js"]
