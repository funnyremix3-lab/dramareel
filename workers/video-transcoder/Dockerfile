# Build from the repository root:
#   docker build -f workers/video-transcoder/Dockerfile -t reel-drama-transcoder .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY workers/video-transcoder/package.json workers/video-transcoder/package-lock.json workers/video-transcoder/
COPY workers/video-transcoder/scripts workers/video-transcoder/scripts
WORKDIR /app/workers/video-transcoder
RUN npm ci --no-audit --no-fund
COPY workers/video-transcoder/tsconfig.json workers/video-transcoder/tsconfig.build.json ./
COPY workers/video-transcoder/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/workers/video-transcoder/node_modules ./node_modules
COPY --from=build /app/workers/video-transcoder/dist ./dist
COPY --from=build /app/workers/video-transcoder/package.json ./
USER node
CMD ["node", "dist/src/main.js"]
