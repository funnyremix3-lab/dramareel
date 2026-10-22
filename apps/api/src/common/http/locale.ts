import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type Locale = 'en' | 'hi';

/** Picks `hi` or `en` from Accept-Language; defaults to `en`. */
export function parseLocale(header: string | undefined): Locale {
  if (!header) return 'en';
  for (const part of header.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (tag.startsWith('hi')) return 'hi';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

export const RequestLocale = createParamDecorator((_: unknown, ctx: ExecutionContext): Locale => {
  return parseLocale(ctx.switchToHttp().getRequest<Request>().headers['accept-language']);
});

/** Reads `{ en: "...", hi: "..." }` JSON labels with English fallback. */
export function localized(value: unknown, locale: Locale): string {
  if (value && typeof value === 'object') {
    const map = value as Record<string, unknown>;
    const hit = map[locale] ?? map.en;
    if (typeof hit === 'string') return hit;
  }
  return typeof value === 'string' ? value : '';
}
