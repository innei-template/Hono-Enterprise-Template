export const REDIS_CLIENT = Symbol.for('core.redis.client')

export type RedisClientToken = typeof REDIS_CLIENT

export { type RedisClient } from '@hono-template/redis'
