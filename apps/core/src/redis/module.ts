import { Module } from '@hono-template/framework'
import { injectable } from 'tsyringe'

import { RedisConfig } from './config'
import { RedisAccessor, RedisProvider } from './providers'

@injectable()
class RedisTokenProvider {
  constructor(private readonly provider: RedisProvider) {}
  get() {
    return this.provider.getClient()
  }
}

@Module({
  providers: [RedisConfig, RedisProvider, RedisAccessor, RedisTokenProvider],
})
export class RedisModule {}
