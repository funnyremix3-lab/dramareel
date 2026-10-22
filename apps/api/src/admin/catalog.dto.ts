import { ApiProperty, ApiPropertyOptional, IntersectionType, OmitType } from '@nestjs/swagger';
import { EpisodeAccess, PublishStatus, VideoOrientation } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AdminPageQuery } from './admin-common';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CastMemberDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 80) name: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) role?: string;
}

export class DramaInputDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(120) slug?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(1, 160) title?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) synopsis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[a-z]{2}$/) primaryLanguageCode?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) categorySlugs?: string[];
  @ApiPropertyOptional({ type: [CastMemberDto] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CastMemberDto) cast?: CastMemberDto[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @ApiPropertyOptional({ enum: VideoOrientation }) @IsOptional() @IsIn(Object.values(VideoOrientation)) orientation?: VideoOrientation;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) maturityRating?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) freeEpisodeCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10000) defaultUnlockCoins?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) trendingScore?: number;
  @ApiPropertyOptional({ description: 'Key returned by poster-upload-url' }) @IsOptional() @IsString() @MaxLength(300) posterKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) coverKey?: string;
}

class DramaRequiredFields {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(120) slug: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 160) title: string;
  @ApiProperty() @IsString() @Matches(/^[a-z]{2}$/) primaryLanguageCode: string;
}

export class CreateDramaDto extends IntersectionType(OmitType(DramaInputDto, ['slug', 'title', 'primaryLanguageCode'] as const), DramaRequiredFields) {}

export class TranslationDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 160) title: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) synopsis?: string;
}

export class DramaListQuery extends AdminPageQuery {
  @ApiPropertyOptional({ enum: PublishStatus }) @IsOptional() @IsIn(Object.values(PublishStatus)) status?: PublishStatus;
}

export class EpisodeInputDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(160) title?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) synopsis?: string;
  @ApiPropertyOptional({ enum: EpisodeAccess }) @IsOptional() @IsIn(Object.values(EpisodeAccess)) access?: EpisodeAccess;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(10000) unlockCoins?: number | null;
}

export class CreateEpisodeDto extends EpisodeInputDto {
  @ApiPropertyOptional({ description: 'Defaults to the next number' }) @IsOptional() @IsInt() @Min(1) @Max(10000) number?: number;
}

export class ImageUploadDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] }) @IsIn(['image/jpeg', 'image/png', 'image/webp']) contentType: string;
  @ApiProperty({ maximum: 5 * 1024 * 1024 }) @IsInt() @Min(1) @Max(5 * 1024 * 1024) sizeBytes: number;
}

export class CategoryDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(60) slug: string;
  @ApiProperty({ example: { en: 'Romance', hi: 'रोमांस' } }) @IsObject() names: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class LanguageDto {
  @ApiProperty() @IsString() @Matches(/^[a-z]{2}$/) code: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 40) name: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 40) nativeName: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}
