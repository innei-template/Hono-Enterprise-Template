import { env } from '@hono-template/env'
import { injectable } from 'tsyringe'

export interface SocialProvidersConfig {
  google?: { clientId: string; clientSecret: string; redirectUri?: string }
  github?: { clientId: string; clientSecret: string; redirectUri?: string }
  zoom?: { clientId: string; clientSecret: string; redirectUri?: string }
}

export interface AuthModuleOptions {
  prefix: string
  useDrizzle: boolean
  socialProviders: SocialProvidersConfig
}

@injectable()
export class AuthConfig {
  getOptions(): AuthModuleOptions {
    const prefix = '/auth'
    const socialProviders: SocialProvidersConfig = {}

    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      socialProviders.google = {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }
    }

    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
      socialProviders.github = {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      }
    }

    return {
      prefix,
      useDrizzle: true,
      socialProviders,
    }
  }
}
