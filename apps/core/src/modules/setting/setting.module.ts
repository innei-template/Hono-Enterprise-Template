import { forwardRef,Module } from '@hono-template/framework'

import { AppModule } from '../app/app.module'

@Module({
  imports: [forwardRef(() => AppModule)],
})
export class SettingModule {}
