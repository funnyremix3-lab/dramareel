import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { RegisterDeviceTokenDto, UpdateConsentsDto, UpdateProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto) {
    return this.users.updateProfile(user.id, body);
  }

  @Put('consents')
  updateConsents(@CurrentUser() user: AuthUser, @Body() body: UpdateConsentsDto) {
    return this.users.updateConsents(user.id, body);
  }

  @Post('device-tokens')
  @HttpCode(204)
  async registerDeviceToken(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceTokenDto) {
    await this.users.registerDeviceToken(user.id, body.token, body.platform);
  }

  @Delete('device-tokens/:token')
  @HttpCode(204)
  async removeDeviceToken(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.users.removeDeviceToken(user.id, token);
  }

  @Delete()
  requestDeletion(@CurrentUser() user: AuthUser) {
    return this.users.requestDeletion(user.id);
  }
}
