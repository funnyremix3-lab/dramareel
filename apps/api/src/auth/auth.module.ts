import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthGuard } from './auth.guard';
import { TokenVerifier } from './token-verifier.service';

@Global()
@Module({
  imports: [UsersModule],
  providers: [TokenVerifier, AuthGuard],
  exports: [TokenVerifier, AuthGuard],
})
export class AuthModule {}
