import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Admin tables use page/pageSize with totals (docs/api.md). */
export class AdminPageQuery {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ default: 25 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MaxLength(100) q?: string;
}

export const skipTake = (q: AdminPageQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export const paged = <T>(items: T[], total: number, q: AdminPageQuery) => ({ items, total, page: q.page, pageSize: q.pageSize });

/** JSON-safe copy (BigInt → number) for API responses and audit snapshots. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens Hindi text correctly. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}
