/** One HLS rendition to produce. `name` follows the short edge ("720p" for 720×1280 portrait). */
export interface RenditionPlan {
  name: string;
  width: number;
  height: number;
  videoBitrateKbps: number;
  maxrateKbps: number;
  bufsizeKbps: number;
}

/** Target ladder by short edge. Bitrates suit 9:16 drama content at 24–30 fps. */
export const LADDER = [
  { shortEdge: 480, kbps: 1000 },
  { shortEdge: 720, kbps: 2500 },
  { shortEdge: 1080, kbps: 5000 },
] as const;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Renditions never upscale: only rungs at or below the source's short edge are produced.
 * A source smaller than the lowest rung gets a single rendition at its own size.
 */
export function planRenditions(sourceWidth: number, sourceHeight: number): RenditionPlan[] {
  if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('Invalid source dimensions');
  const portrait = sourceHeight >= sourceWidth;
  const sourceShort = Math.min(sourceWidth, sourceHeight);
  const ratio = Math.max(sourceWidth, sourceHeight) / sourceShort;

  const rungs: { shortEdge: number; kbps: number }[] = LADDER.filter((r) => r.shortEdge <= sourceShort);
  if (rungs.length === 0) rungs.push({ shortEdge: even(sourceShort), kbps: 700 });

  return rungs.map(({ shortEdge, kbps }) => {
    const longEdge = even(shortEdge * ratio);
    return {
      name: `${shortEdge}p`,
      width: portrait ? shortEdge : longEdge,
      height: portrait ? longEdge : shortEdge,
      videoBitrateKbps: kbps,
      maxrateKbps: Math.round(kbps * 1.07),
      bufsizeKbps: kbps * 2,
    };
  });
}
