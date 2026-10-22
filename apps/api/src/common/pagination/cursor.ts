import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AppException } from '../errors/app-exception';

export const MAX_PAGE_SIZE = 50;

export class CursorQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous response' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function encodeCursor(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** Decodes a cursor and checks that every expected key has the right primitive type. */
export function decodeCursor<T extends Record<string, 'string' | 'number'>>(
  cursor: string | undefined,
  shape: T,
): { [K in keyof T]: T[K] extends 'number' ? number : string } | null {
  if (!cursor) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AppException('VALIDATION_FAILED', 'Invalid cursor');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new AppException('VALIDATION_FAILED', 'Invalid cursor');
  }
  for (const [key, type] of Object.entries(shape)) {
    const v = (parsed as Record<string, unknown>)[key];
    if (typeof v !== type || (type === 'number' && (!Number.isFinite(v) || (v as number) < 0))) {
      throw new AppException('VALIDATION_FAILED', 'Invalid cursor');
    }
  }
  return parsed as never;
}

/** Offset pagination behind an opaque cursor (fine at launch scale; swappable for keyset later). */
export async function offsetPage<T>(
  query: CursorQuery,
  fetch: (skip: number, take: number) => Promise<T[]>,
): Promise<Page<T>> {
  const offset = decodeCursor(query.cursor, { o: 'number' })?.o ?? 0;
  const rows = await fetch(offset, query.limit + 1);
  const hasMore = rows.length > query.limit;
  return {
    items: rows.slice(0, query.limit),
    nextCursor: hasMore ? encodeCursor({ o: offset + query.limit }) : null,
  };
}
