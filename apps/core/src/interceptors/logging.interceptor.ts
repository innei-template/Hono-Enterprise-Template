import type { CallHandler, ExecutionContext, NestInterceptor } from '@hono-template/framework'
import { createLogger } from '@hono-template/framework'
import { toUri } from 'core/helpers/url.helper'
import { green } from 'picocolors'
import { injectable } from 'tsyringe'

const httpLogger = createLogger('HTTP')

function toResponse(payload: unknown, context: any): Response {
  if (payload instanceof Response) return payload
  if (payload === undefined || payload === context.res) return context.res
  if (typeof payload === 'string') return new Response(payload)
  if (payload instanceof ArrayBuffer) return new Response(payload)
  if (ArrayBuffer.isView(payload)) {
    return new Response(payload as unknown as BodyInit)
  }
  if (payload instanceof ReadableStream) return new Response(payload)

  return new Response(JSON.stringify(payload ?? null), {
    headers: { 'content-type': 'application/json' },
  })
}

@injectable()
export class LoggingInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const start = performance.now()
    const honoContext = context.getContext()
    const { method, url } = honoContext.req

    {
      const parts: string[] = ['<---', `${method} -> ${toUri(url)}`]
      httpLogger.info(parts.join(' '))
    }

    const result = await next.handle()
    const response = toResponse(result, honoContext)

    const durationMs = Number((performance.now() - start).toFixed(2))
    {
      const parts: string[] = ['--->', `${method} -> ${toUri(url)}`, green(`+${durationMs}ms`)]
      httpLogger.info(parts.join(' '))
    }

    return response
  }
}
