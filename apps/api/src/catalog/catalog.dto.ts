import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { CursorQuery } from '../common/pagination/cursor';

export const DRAMA_SORTS = ['trending', 'new', 'popular'] as const;
export type DramaSort = (typeof DRAMA_SORTS)[number];

export class ListDramasQuery extends CursorQuery {
  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/)
  category?: string;

  @ApiPropertyOptional({ enum: DRAMA_SORTS, default: 'trending' })
  @IsOptional()
  @IsIn(DRAMA_SORTS)
  sort: DramaSort = 'trending';
}

export class SearchDramasQuery extends CursorQuery {
  @ApiPropertyOptional({ minLength: 2, maxLength: 60 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 60)
  q: string;
}
