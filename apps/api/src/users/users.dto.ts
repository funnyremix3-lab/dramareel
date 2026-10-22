import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export const SUPPORTED_LOCALES = ['en', 'hi'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(280)
  bio?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;
}

export class UpdateConsentsDto {
  @ApiProperty() @IsBoolean() analytics: boolean;
  @ApiProperty() @IsBoolean() adsPersonalization: boolean;
  @ApiProperty() @IsBoolean() marketing: boolean;
  @ApiProperty() @IsBoolean() push: boolean;
}

export class RegisterDeviceTokenDto {
  @ApiProperty({ maxLength: 4096 })
  @IsString()
  @Length(10, 4096)
  token: string;

  @ApiProperty({ enum: ['ANDROID', 'IOS'] })
  @IsIn(['ANDROID', 'IOS'])
  platform: 'ANDROID' | 'IOS';
}
