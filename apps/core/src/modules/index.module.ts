import { Module } from '@hono-template/framework'

import { AppModule } from './app/app.module'

@Module({
  imports: [AppModule],
})
export class AppModules {}
