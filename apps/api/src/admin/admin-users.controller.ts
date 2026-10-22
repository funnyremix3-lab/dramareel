import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, Length, Matches, Max, Min, NotEquals } from 'class-validator';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { AdminPageQuery } from './admin-common';
import { AdminUsersService } from './admin-users.service';

class WalletAdjustmentDto {
  @ApiProperty({ description: 'Signed coin delta' }) @IsInt() @Min(-100_000) @Max(100_000) @NotEquals(0) amount: number;
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @Length(3, 280) note: string;
}

class SetRolesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) roles: string[];
}

class RoleDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,39}$/) key: string;
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) permissions: string[];
}

const uuid = () => new ParseUUIDPipe();

@ApiTags('admin: users')
@ApiBearerAuth()
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get('users')
  @RequirePermissions('users:read')
  list(@Query() q: AdminPageQuery) {
    return this.users.list(q);
  }

  @Get('users/:id')
  @RequirePermissions('users:read')
  detail(@Param('id', uuid()) id: string) {
    return this.users.detail(id);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  @RequirePermissions('users:suspend')
  suspend(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.users.setStatus(req, id, 'SUSPENDED');
  }

  @Post('users/:id/reinstate')
  @HttpCode(200)
  @RequirePermissions('users:suspend')
  reinstate(@Req() req: Request, @Param('id', uuid()) id: string) {
    return this.users.setStatus(req, id, 'ACTIVE');
  }

  @Post('users/:id/wallet-adjustments')
  @RequirePermissions('wallet:adjust')
  adjust(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: WalletAdjustmentDto) {
    return this.users.adjustWallet(req, id, body.amount, body.note);
  }

  @Put('users/:id/roles')
  @RequirePermissions('roles:write')
  setRoles(@Req() req: Request, @Param('id', uuid()) id: string, @Body() body: SetRolesDto) {
    return this.users.setRoles(req, id, body.roles);
  }

  @Get('roles')
  @RequirePermissions('roles:write')
  roles() {
    return this.users.listRoles();
  }

  @Put('roles')
  @RequirePermissions('roles:write')
  upsertRole(@Req() req: Request, @Body() body: RoleDto) {
    return this.users.upsertRole(req, body);
  }
}
