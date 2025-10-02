import { Module } from '@hono-template/framework'

import { DatabaseModule } from '../database/module'
import { AppModule } from './app/app.module'

@Module({
  imports: [DatabaseModule, AppModule],
})
export class AppModules {}
