# Video Pipeline

## Storage layout (one private bucket)
| Prefix | Contents | Who can read |
|---|---|---|
| `originals/{assetId}/source.{ext}` | Uploaded source files | Nobody over HTTP. Only the transcoder, via S3 credentials. |
| `processed/{assetId}/master.m3u8`, `{480p,720p,1080p}/index.m3u8`, `seg_###.ts`, `thumb.jpg`, `poster.jpg` | HLS output | The media edge, after a valid playback token |
| `public/thumbnails/{assetId}.jpg`, `public/posters/…` | List images | Anyone (CDN-cached) |
| `subtitles/{episodeId}/{lang}.vtt` | WebVTT files | Short-lived presigned GET returned by the playback API |

Production uses Cloudflare R2 (S3 API) behind the `reel-drama-media` Worker. Local development uses SeaweedFS (`infra/docker`), with the API's `/dev-media` proxy standing in for the Worker.

## Upload → READY
```
Admin UI ──POST /admin/episodes/{id}/video-assets {contentType,sizeBytes}──► API
          ◄── { assetId, uploadUrl (PUT, 15 min, signs Content-Type + Content-Length) }
Admin UI ──PUT file──────────────────────────────────────────────────────► R2 originals/
Admin UI ──POST /admin/video-assets/{id}/complete──► API: HEAD object, size must match,
                                                     AWAITING_UPLOAD→UPLOADED (conditional), enqueue
BullMQ "video-transcode" (jobId = assetId) ──► workers/video-transcoder
   1. status PROCESSING, attempts+1
   2. download original → ffprobe → validate (codec, 144–4096 px, 1 s–3 h, rotation applied)
   3. renditions at or below the source short edge: 480p 1.0 Mbps / 720p 2.5 Mbps / 1080p 5 Mbps
      (H.264 Main, AAC 128k, 2 s keyframes, 6 s TS segments, VOD playlists)
   4. master.m3u8, thumb.jpg (360 w), poster.jpg (720 w)
   5. delete processed/{assetId}/, then upload (retries never mix encodes)
   6. one DB transaction: asset READY + renditions; the episode adopts it if it has no video yet
```
Failures are handled like this:
- **Invalid media** (e.g. an unsupported codec or a 0-second file) marks the asset `FAILED` immediately and is never retried (`UnrecoverableError`).
- **Other errors** are retried 3 times with exponential backoff starting at 30 s. After the last failure the asset is marked `FAILED` and `last_error` is recorded.
- An admin can call `POST /admin/video-assets/{id}/retry` on a `FAILED` asset.
- **Replacing a video:** upload a new asset, then switch to it with `PUT /admin/episodes/{id}/current-asset`. The old asset stays available, so you can roll back.

## Playback
1. `GET /api/v1/episodes/{id}/playback` runs the entitlement check (the same rule as the episode list) and returns `403 EPISODE_LOCKED` with unlock options, or:
2. A token `base64url({a: assetId, e: exp, u: userTag}).HMAC-SHA256`, valid for 6 h (`PLAYBACK_TOKEN_TTL_SECONDS`).
3. `manifestUrl = {MEDIA_BASE_URL}/p/{token}/{assetId}/master.m3u8`. Segment URIs are relative, so the token in the path covers every request the player makes.
4. The Worker verifies the HMAC, the expiry, the asset match and the path allow-list. Verified segments are cached in the Cloudflare Cache API under a token-free key, so many viewers share one cache entry.

`apps/api/src/media/playback-token.ts` and `infra/cloudflare/media-worker/src/playback-token.ts` must stay byte-identical. The worker test suite fails if they drift.

**Limits, stated plainly:** tokens stop link sharing after expiry and keep originals private. They are **not DRM**. Someone who is allowed to watch an episode can still record their screen or save segments during the token's lifetime. Android `FLAG_SECURE` on the player screen blocks casual screenshots and screen recording.

## Running locally
```bash
docker compose -f infra/docker/docker-compose.yml up -d     # postgres, redis, s3
cd workers/video-transcoder && cp .env.example .env && npm install
npm run seed:media -- --limit 10    # synthetic 20 s clips → real pipeline (dev only)
npm run dev                          # queue consumer for admin uploads
```
The API needs these in `.env`:
- `S3_*` pointing at `http://localhost:9000`
- `REDIS_URL=redis://localhost:63799`
- `PLAYBACK_SIGNING_KEY` (32 random bytes, base64)
- `DEV_MEDIA_PROXY=true`
- `MEDIA_BASE_URL=http://<host>:3000/dev-media`

## Production checklist
- Create the R2 bucket. Grant the API and the transcoder separate S3 tokens: the API needs PUT on `originals/` and HEAD; the transcoder needs read/write.
- Deploy the Worker with `wrangler secret put PLAYBACK_SIGNING_KEY` (the same value as the API), bind it to the bucket, and route it to `media.<domain>`.
- Leave public access off for the R2 bucket. The Worker is the only reader.
- Size the transcoder at about 2 vCPU per concurrent job. A 90-second 1080p episode takes roughly 1–2 minutes to encode on `veryfast`.
- Watch storage, Class A/B operations and Worker requests in the Cloudflare dashboard (see [deployment.md](deployment.md)).
