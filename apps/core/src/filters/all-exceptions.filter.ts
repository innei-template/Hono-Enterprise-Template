import type { ArgumentsHost, ExceptionFilter } from '@hono-template/framework'
import { createLogger, HttpException } from '@hono-template/framework'
import { toUri } from 'core/helpers/url.helper'
import { injectable } from 'tsyringe'

@injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = createLogger('AllExceptionsFilter')
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      return new Response(JSON.stringify(exception.getResponse()), {
        status: exception.getStatus(),
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    const store = host.getContext()
    const ctx = store.hono

    const error = exception instanceof Error ? exception : new Error(String(exception))

    this.logger.error(`--- ${ctx.req.method} ${toUri(ctx.req.url)} --->\n`, error)

    return new Response(
      JSON.stringify({
        statusCode: 500,
        message: 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      },
    )
  }
}
