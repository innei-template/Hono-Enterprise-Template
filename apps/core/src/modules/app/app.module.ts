import { Module } from '@hono-template/framework'
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { ParseIntPipe } from './pipes/parse-int.pipe';
import { ValidationPipe } from './pipes/validation.pipe';
import { CreateMessagePipe } from './pipes/create-message.pipe';

@Module({
  controllers: [AppController],
  providers: [
    AppService,
    ApiKeyGuard,
    LoggingInterceptor,
    ValidationPipe,
    ParseIntPipe,
    CreateMessagePipe,
    AllExceptionsFilter,
  ],
})
export class AppModule {}
