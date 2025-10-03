import { ContextParam, Controller, Get, Post } from '@hono-template/framework'
import type { Context } from 'hono'

import { AuthProvider } from './auth.provider'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthProvider) {}

  @Get('/*')
  async passthroughGet(@ContextParam() context: Context) {
    return await this.auth.handler(context)
  }

  @Post('/*')
  async passthroughPost(@ContextParam() context: Context) {
    return await this.auth.handler(context)
  }

  @Get('/session')
  async getSession(@ContextParam() context: Context) {
    const auth = this.auth.getAuth()
    const session = await auth.api.getSession({ headers: context.req.raw.headers })
    if (!session) {
      return context.body(null, 401)
    }
    return { user: session.user, session: session.session }
  }
}
