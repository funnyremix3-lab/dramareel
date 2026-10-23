# Drama importer

This tool turns one long video into a short drama. It splits the video into episodes of about 3:20 each and imports them through the Admin API.

**Only import content you own or are licensed to distribute.**

## How it picks cuts

1. Word timings come from the captions (YouTube `json3`). A gap between words is a pause, and a gap after `. ! ? ।` counts extra.
2. `ffmpeg silencedetect` finds real silence in the audio. Caption pauses that line up with silence get a bonus.
3. Each cut lands on the best pause within ±`--tolerance` seconds of the `--target` length. The best pause is the one closest to the target, with longer pauses preferred.
   - If there is no pause in that window, the tool cuts at exactly the target and the plan marks it ⚠.
   - If the remainder at the end is shorter than `--min-last` seconds, it joins the previous episode.

Clips are re-encoded rather than stream-copied, so each cut is frame-accurate at the sentence boundary. The transcoder then builds the HLS ladder as usual.

Subtitle files (`--subs`) are cut and re-timed for each episode, then uploaded as that episode's WebVTT subtitles.

## Usage

These commands need the API (`apps/api`), the transcoder worker (`workers/video-transcoder`, `npm run dev`) and docker services.

```bash
cd tools/drama-importer && npm install

# 1. Preview the cuts (nothing is uploaded)
npm run import -- plan --video ../../media/source/x.mp4 --captions ../../media/source/x.en-orig.json3

# 2. Cut, create the drama and episodes, and upload video, poster and subtitles
npm run import -- import --video … --captions … --subs en=x.en.vtt,hi=x.hi.vtt \
  --title "Drama title" --slug drama-slug --categories romance,family --out ../../media/work/drama-slug

# 3. After transcoding finishes, publish the drama and its episodes
npm run import -- publish --out ../../media/work/drama-slug
```

### Options

| Flag | Default | Meaning |
|---|---|---|
| `--target` | `200` | Ideal episode length in seconds (3:20) |
| `--tolerance` | `25` | How far a cut may move from the target to find a pause |
| `--min-last` | `60` | A shorter final remainder is merged into the previous episode |
| `--free` / `--coins` | `5` / `30` | Free episodes and the default unlock price |
| `--language` | `en` | Primary language of the drama |
| `--poster-at` | ~30 s | Timestamp of the frame used as the poster |

### Authentication

- Set `ADMIN_TOKEN` in the environment. Never commit it.
- In development, if `ADMIN_TOKEN` is unset, the tool gets a token from `POST /dev/token` (account `--dev-account`, default `owner`).

### Resuming

Progress is saved to `<out>/state.json`. Re-running `import` skips clips, episodes and uploads that are already done.

Keep `media/` out of git; the repository `.gitignore` already excludes it.
