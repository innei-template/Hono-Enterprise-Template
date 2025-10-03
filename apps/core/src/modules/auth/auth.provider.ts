import { authAccounts, authSessions, authUsers } from '@hono-template/db'
import { createLogger } from '@hono-template/framework'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Context } from 'hono'
import { injectable } from 'tsyringe'

import { DrizzleProvider } from '../../database/database.provider'
import { AuthConfig } from './auth.config'

export type BetterAuthInstance = ReturnType<typeof betterAuth>

const logger = createLogger('Auth')

@injectable()
export class AuthProvider {
  private instance?: BetterAuthInstance

  constructor(
    private readonly config: AuthConfig,
    private readonly drizzleProvider: DrizzleProvider,
  ) {
    this.instance = this.getAuth()
  }

  getAuth(): BetterAuthInstance {
    if (!this.instance) {
      const options = this.config.getOptions()
      const db = this.drizzleProvider.getDb()
      this.instance = betterAuth({
        database: drizzleAdapter(db, {
          provider: 'pg',
          schema: {
            user: authUsers,
            session: authSessions,
            account: authAccounts,
          },
        }),
        socialProviders: options.socialProviders,
        emailAndPassword: { enabled: true },
        user: {
          // Map model name if needed (we pass schema above). Also add additional fields.
          additionalFields: {
            role: {
              type: 'string',
              defaultValue: 'user',
              input: false,
            },
          },
        },
      })
      logger.info('Better Auth initialized')
    }
    return this.instance
  }

  handler(context: Context): Promise<Response> {
    const auth = this.getAuth()
    return auth.handler(context.req.raw)
  }
}
