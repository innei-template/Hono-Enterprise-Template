import { Module } from '@hono-template/framework'
import { DatabaseModule } from 'core/database/database.module'

import { AuthController } from './auth.controller'
import { AuthProvider } from './auth.provider'

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthProvider],
})
export class AuthModule {}
