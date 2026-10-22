/** Dark-only palette tuned for full-screen video. */
export const colors = {
  background: '#0B0B0F',
  surface: '#17171D',
  surfaceRaised: '#22222A',
  border: '#2E2E38',
  text: '#FFFFFF',
  textSecondary: '#A6A6B2',
  textMuted: '#6E6E7A',
  accent: '#FF2D55',
  accentPressed: '#D61F45',
  coin: '#FFC94D',
  vip: '#F5C451',
  success: '#34C759',
  danger: '#FF453A',
  overlay: 'rgba(0,0,0,0.55)',
  scrim: 'rgba(0,0,0,0.35)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 12, color: colors.textSecondary },
};

/** Text shadow that keeps labels readable over bright video frames. */
export const overlayText = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
} as const;

export function compactNumber(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}
