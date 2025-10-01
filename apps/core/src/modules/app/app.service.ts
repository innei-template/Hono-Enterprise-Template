import { injectable } from 'tsyringe'
import type { CreateMessageInput } from './schemas/message.schema'

@injectable()
export class AppService {
  getHello(echo?: string | null): { message: string; timestamp: string; echo?: string | null } {
    return {
      message: 'Hello from HonoHttpApplication',
      timestamp: new Date().toISOString(),
      echo: echo ?? undefined,
    };
  }

  getProfile(id: number, verbose: boolean) {
    return {
      id,
      username: `user-${id}`,
      role: id % 2 === 0 ? 'admin' : 'member',
      verbose:
        verbose
          ? {
              lastLogin: new Date(Date.now() - 3_600_000).toISOString(),
              flags: ['beta', 'notifications'],
            }
          : undefined,
    };
  }

  createMessage(id: number, payload: CreateMessageInput) {
    return {
      id,
      ...payload,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
  }
}
