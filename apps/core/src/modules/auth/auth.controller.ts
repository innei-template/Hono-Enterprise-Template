import { Body, ContextParam, Controller, Get, Post, UnauthorizedException, UseGuards } from '@hono-template/framework'
import type { Context } from 'hono'

import { AuthGuard } from '../../guards/auth.guard'
import { RoleBit, Roles } from '../../guards/roles.decorator'
import { AuthProvider } from './auth.provider'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthProvider) {}

  @Get('/session')
  async getSession(@ContextParam() context: Context) {
    const auth = this.auth.getAuth()
    const session = await auth.api.getSession({ headers: context.req.raw.headers })
    if (!session) {
      throw new UnauthorizedException()
    }
    return { user: session.user, session: session.session }
  }

  @Post('/sign-up/email')
  async signUpEmail(
    @ContextParam() _context: Context,
    @Body() body: { name: string; email: string; password: string },
  ) {
    const auth = this.auth.getAuth()

    const res = await auth.api.signUpEmail({
      body: {
        name: body.name,
        email: body.email,
        password: body.password,
      },
    })

    return res
  }

  @Post('/sign-in/email')
  async signInEmail(@ContextParam() _context: Context, @Body() body: { email: string; password: string }) {
    const auth = this.auth.getAuth()
    const response = await auth.api.signInEmail({
      body: {
        email: body.email,
        password: body.password,
      },
      asResponse: true,
    })
    return response
  }

  @Get('/admin-only')
  @UseGuards(AuthGuard)
  @Roles(RoleBit.ADMIN)
  async adminOnly(@ContextParam() _context: Context) {
    return { ok: true }
  }

  @Get('/*')
  async passthroughGet(@ContextParam() context: Context) {
    return await this.auth.handler(context)
  }

  @Post('/*')
  async passthroughPost(@ContextParam() context: Context) {
    return await this.auth.handler(context)
  }
}
