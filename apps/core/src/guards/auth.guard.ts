import type { CanActivate, ExecutionContext } from '@hono-template/framework'
import { HttpContext, UnauthorizedException } from '@hono-template/framework'
import type { Session, User } from 'better-auth'
import { injectable } from 'tsyringe'

import { AuthProvider } from '../modules/auth/auth.provider'

declare module '@hono-template/framework' {
  interface HttpContextValues {
    auth?: {
      user?: User
      session?: Session
    }
  }
}

@injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authProvider: AuthProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const store = context.getContext()
    const { hono } = store

    const auth = this.authProvider.getAuth()

    const session = await auth.api.getSession({ headers: hono.req.raw.headers })
    if (!session) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Unauthorized',
      })
    }

    HttpContext.assign({
      auth: {
        user: session.user,
        session: session.session,
      },
    })
    return true
  }
}
