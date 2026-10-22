import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignStatus, CreativeType, Platform, PricingModel } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AdminPageQuery } from './admin-common';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PlacementUpdateDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AdConfigurationDto {
  @ApiProperty({ enum: ['ANDROID', 'IOS'] }) @IsIn(['ANDROID', 'IOS']) platform: Platform;
  @ApiProperty({ enum: ['ADMOB', 'DIRECT'] }) @IsIn(['ADMOB', 'DIRECT']) source: 'ADMOB' | 'DIRECT';
  @ApiPropertyOptional({ nullable: true, example: 'ca-app-pub-1234567890123456/1234567890' })
  @IsOptional()
  @Matches(/^ca-app-pub-\d{16}\/\d{10}$/, { message: 'adUnitId must look like ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN' })
  adUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2) @Max(100) minEpisodesBetween?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(86_400) minSecondsBetween?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(500) maxPerUserPerDay?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000) rewardCoins?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hideForSubscribers?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class TargetingDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsIn(['en', 'hi'], { each: true }) languages?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsIn(['ANDROID', 'IOS'], { each: true }) platforms?: Platform[];
}

export class CampaignDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 120) name: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 120) advertiserName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) advertiserContact?: string;
  @ApiProperty() @IsDateString() startAt: string;
  @ApiProperty() @IsDateString() endAt: string;
  @ApiProperty({ enum: PricingModel }) @IsIn(Object.values(PricingModel)) pricingModel: PricingModel;
  @ApiProperty({ description: 'Paise: per 1000 impressions (CPM), per click (CPC) or total (FLAT)' }) @IsInt() @Min(0) @Max(1_000_000_000) ratePaise: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000_000_000) totalBudgetPaise?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10_000_000) dailyImpressionCap?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) perUserDailyCap?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) priority?: number;
  @ApiPropertyOptional({ type: TargetingDto }) @IsOptional() @IsObject() @ValidateNested() @Type(() => TargetingDto) targeting?: TargetingDto;
  @ApiProperty({ type: [String], description: 'Placement keys' }) @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) placementKeys: string[];
}

export class CampaignListQuery extends AdminPageQuery {
  @ApiPropertyOptional({ enum: CampaignStatus }) @IsOptional() @IsIn(Object.values(CampaignStatus)) status?: CampaignStatus;
}

export class CreativeUploadDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] }) @IsIn(['image/jpeg', 'image/png', 'image/webp']) contentType: string;
  @ApiProperty() @IsInt() @Min(1) @Max(2 * 1024 * 1024) sizeBytes: number;
}

export class CreativeDto {
  @ApiProperty({ enum: ['IMAGE'] }) @IsIn([CreativeType.IMAGE]) type: CreativeType;
  @ApiProperty() @IsString() @MaxLength(300) mediaKey: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(90) headline?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(30) ctaText?: string;
  @ApiProperty() @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true }) @MaxLength(2000) destinationUrl: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(3, 30) label?: string;
}

export class CreativeReviewDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
}

export class ReportRangeQuery {
  @ApiProperty() @IsDateString() from: string;
  @ApiProperty() @IsDateString() to: string;
}

export class NetworkReportRowDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() @MaxLength(120) adUnitId: string;
  @ApiProperty() @IsInt() @Min(0) impressions: number;
  @ApiProperty() @IsInt() @Min(0) clicks: number;
  @ApiProperty({ description: 'Estimated earnings in micros of the currency' }) @IsInt() @Min(0) estimatedEarningsMicros: number;
  @ApiProperty() @IsString() @Matches(/^[A-Z]{3}$/) currency: string;
}

export class NetworkReportImportDto {
  @ApiProperty({ type: [NetworkReportRowDto] }) @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => NetworkReportRowDto) rows: NetworkReportRowDto[];
}

export class ProductDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9_.]{2,100}$/) sku: string;
  @ApiProperty({ enum: ['COIN_PACK', 'SUBSCRIPTION'] }) @IsIn(['COIN_PACK', 'SUBSCRIPTION']) kind: 'COIN_PACK' | 'SUBSCRIPTION';
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80) title: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1_000_000) coins?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1_000_000) bonusCoins?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(366) periodDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() adFree?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

