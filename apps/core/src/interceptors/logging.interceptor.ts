import type { CallHandler, ExecutionContext, NestInterceptor } from '@hono-template/framework'
import { injectable } from 'tsyringe'

@injectable()
export class LoggingInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const start = performance.now()
    const honoContext = context.getContext()
    const { method, url } = honoContext.req

    try {
      const result = await next.handle()
      const duration = (performance.now() - start).toFixed(2)
      console.info(`${method} ${url} -> ${duration}ms`)
      return result
    } catch (error) {
      const duration = (performance.now() - start).toFixed(2)
      console.error(`${method} ${url} failed in ${duration}ms`, error)
      throw error
    }
  }
}
