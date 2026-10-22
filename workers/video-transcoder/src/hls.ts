import { RenditionPlan } from './ladder';

/** H.264 Main@L3.1/L4.0 + AAC-LC codec strings for the master playlist. */
function codecs(plan: RenditionPlan, hasAudio: boolean): string {
  const level = Math.min(plan.width, plan.height) > 720 ? '28' : '1f';
  return hasAudio ? `avc1.4d40${level},mp4a.40.2` : `avc1.4d40${level}`;
}

/** Master playlist listing renditions from highest to lowest; each lives in `{name}/index.m3u8`. */
export function masterPlaylist(plans: RenditionPlan[], hasAudio: boolean): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const plan of [...plans].sort((a, b) => b.videoBitrateKbps - a.videoBitrateKbps)) {
    const bandwidth = (plan.maxrateKbps + (hasAudio ? 128 : 0)) * 1000;
    const average = (plan.videoBitrateKbps + (hasAudio ? 128 : 0)) * 1000;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AVERAGE-BANDWIDTH=${average},RESOLUTION=${plan.width}x${plan.height},CODECS="${codecs(plan, hasAudio)}",NAME="${plan.name}"`,
      `${plan.name}/index.m3u8`,
    );
  }
  return lines.join('\n') + '\n';
}
