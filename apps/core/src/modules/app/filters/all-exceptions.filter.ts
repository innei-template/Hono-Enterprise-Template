import { injectable } from 'tsyringe';
import type { ArgumentsHost, ExceptionFilter } from '@hono-template/framework'
import { HttpException } from '@hono-template/framework'

@injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.getContext();

    if (exception instanceof HttpException) {
      return new Response(JSON.stringify(exception.getResponse()), {
        status: exception.getStatus(),
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    const error = exception instanceof Error ? exception : new Error(String(exception));
    console.error('Unhandled exception caught by filter', error);

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
    );
  }
}
