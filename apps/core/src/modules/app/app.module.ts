import { forwardRef,Module } from '@hono-template/framework'

import { ParseIntPipe } from '../../pipes/parse-int.pipe'
import { SettingModule } from '../setting/setting.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  imports: [forwardRef(() => SettingModule)],
  controllers: [AppController],
  providers: [AppService, ParseIntPipe],
})
export class AppModule {}
