import { env } from '@hono-template/env'
import { injectable } from 'tsyringe'

export interface RedisOptions {
  url: string
}

@injectable()
export class RedisConfig {
  getOptions(): RedisOptions {
    const url = env.REDIS_URL
    if (!url || url.trim().length === 0) {
      throw new Error('REDIS_URL is required for redis connection')
    }
    return { url }
  }
}
