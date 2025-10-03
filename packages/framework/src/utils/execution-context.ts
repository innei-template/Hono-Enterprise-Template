import type { DependencyContainer } from 'tsyringe'

import type {HttpContextValues} from '../context/http-context';
import { HttpContext  } from '../context/http-context'
import type { ArgumentsHost, ExecutionContext, HttpArgumentsHost } from '../interfaces'

class HttpArgumentsHostImpl implements HttpArgumentsHost {
  getContext<T = HttpContextValues>(): T {
    return HttpContext.get<T>()
  }
}

export class FrameworkExecutionContext<T extends (...args: any[]) => any> implements ExecutionContext, ArgumentsHost {
  constructor(
    public readonly container: DependencyContainer,
    private readonly target: any,
    private readonly handler: T,
  ) {}

  getClass<T = any>(): T {
    return this.target
  }

  getHandler(): T {
    return this.handler
  }

  getContext<T = HttpContextValues>(): T {
    return HttpContext.get<T>()
  }

  switchToHttp(): HttpArgumentsHost {
    return new HttpArgumentsHostImpl()
  }
}

export function createExecutionContext<T extends (...args: any[]) => any>(
  container: DependencyContainer,
  target: any,
  handler: T,
): FrameworkExecutionContext<T> {
  return new FrameworkExecutionContext(container, target, handler)
}
