import { randomUUID } from 'node:crypto'

import {
  Body,
  ContextParam,
  Controller,
  Get,
  Headers,
  HttpContext,
  Param,
  Post,
  Query,
  UseGuards,
} from '@hono-template/framework'
import type { Context } from 'hono'
import { inject, injectable } from 'tsyringe'

import { AppService } from './app.service'
import { ApiKeyGuard } from './guards/api-key.guard'
import { CreateMessagePipe } from './pipes/create-message.pipe'
import { ParseIntPipe } from './pipes/parse-int.pipe'
import type { CreateMessageInput } from './schemas/message.schema'

@Controller('app')
@injectable()
export class AppController {
  constructor(@inject(AppService) private readonly appService: AppService) {}

  @Get('/')
  async getRoot(@Query('echo') echo?: string | null) {
    return this.appService.getHello(echo)
  }

  @Get('/profiles/:id')
  @UseGuards(ApiKeyGuard)
  async getProfile(
    @Param('id', ParseIntPipe) id: number,
    @Query('verbose') verbose?: string,
  ) {
    return this.appService.getProfile(id, verbose === 'true')
  }

  @Get('/test/:id')
  async test(
    @Param('id', ParseIntPipe) id: number,
    @Query('name') name?: string,
  ) {
    return {
      id,
      name,
    }
  }

  @Post('/messages/:id')
  async createMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body(undefined, CreateMessagePipe) payload: CreateMessageInput,
    context: Context,
    @Headers('x-request-id') requestId?: string,
  ) {
    const message = this.appService.createMessage(id, payload)

    return {
      requestId: requestId ?? randomUUID(),
      origin: context.req.header('cf-connecting-ip') ?? 'local',
      data: message,
    }
  }

  @Get('/error')
  async triggerError(): Promise<void> {
    throw new Error('Simulated failure for exception filter test')
  }

  @Get('/context-check')
  async checkHttpContext(@ContextParam() context: Context) {
    const stored = HttpContext.get<Context>()
    return {
      same: stored === context,
      path: stored.req.path,
    }
  }
}
