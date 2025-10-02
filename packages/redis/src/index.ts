import type { RedisOptions as IORedisOptions } from 'ioredis'
import Redis from 'ioredis'

export type RedisClient = Redis
export type RedisClientOptions = IORedisOptions

export function createRedisClient(url: string, options?: RedisClientOptions): RedisClient {
  return new Redis(url, options ?? {})
}
