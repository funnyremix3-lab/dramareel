import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportJobStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Source types a long import video may be uploaded as. */
export const IMPORT_SOURCE_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
};

export class SourceUploadDto {
  @ApiProperty({ enum: Object.keys(IMPORT_SOURCE_TYPES) })
  @IsIn(Object.keys(IMPORT_SOURCE_TYPES))
  contentType: string;

  @ApiProperty({ description: 'Exact file size in bytes', maximum: 8 * 1024 * 1024 * 1024 })
  @IsInt()
  @Min(1)
  @Max(8 * 1024 * 1024 * 1024)
  sizeBytes: number;
}

export class CreateImportDto {
  @ApiProperty({ description: 'sourceKey returned by source-upload-url' })
  @IsString()
  @MaxLength(300)
  sourceKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  sourceSizeBytes?: number;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  title: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(120)
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  synopsis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/)
  primaryLanguageCode?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  categorySlugs?: string[];

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  freeEpisodeCount?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  defaultUnlockCoins?: number;

  @ApiPropertyOptional({ default: 90, description: 'Ideal episode length in seconds' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(600)
  targetSeconds?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  toleranceSeconds?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;
}

export class ListImportsQuery {
  @ApiPropertyOptional({ enum: ImportJobStatus })
  @IsOptional()
  @IsIn(Object.values(ImportJobStatus))
  status?: ImportJobStatus;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

/** Progress/outcome patch sent by the import runner. */
export class UpdateImportDto {
  @ApiPropertyOptional({ enum: ['RUNNING', 'READY', 'DONE', 'FAILED'] })
  @IsOptional()
  @IsIn(['RUNNING', 'READY', 'DONE', 'FAILED'])
  status?: 'RUNNING' | 'READY' | 'DONE' | 'FAILED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/)
  dramaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  totalEpisodes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  uploadedEpisodes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  publishedEpisodes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  step?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  lastError?: string;
}
