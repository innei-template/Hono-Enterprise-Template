import { injectable } from 'tsyringe'
import type { CanActivate, ExecutionContext } from '@hono-template/framework'
import { UnauthorizedException } from '@hono-template/framework'

@injectable()
export class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const honoContext = context.getContext();
    const apiKey = honoContext.req.header('x-api-key');
    const expected = process.env.API_KEY ?? 'secret-key';

    if (apiKey !== expected) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid API key',
      });
    }

    return true;
  }
}
