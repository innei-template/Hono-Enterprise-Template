import type { Context } from 'hono';
import type { DependencyContainer } from 'tsyringe';
import type {
  ArgumentsHost,
  ExecutionContext,
  HttpArgumentsHost,
} from '../interfaces';

class HttpArgumentsHostImpl implements HttpArgumentsHost {
  constructor(private readonly context: Context) {}

  getContext<T = Context>(): T {
    return this.context as unknown as T;
  }
}

export class FrameworkExecutionContext implements ExecutionContext, ArgumentsHost {
  constructor(
    private readonly context: Context,
    public readonly container: DependencyContainer,
    private readonly target: any,
    private readonly handler: Function,
  ) {}

  getClass<T = any>(): T {
    return this.target;
  }

  getHandler(): Function {
    return this.handler;
  }

  getContext<T = Context>(): T {
    return this.context as unknown as T;
  }

  switchToHttp(): HttpArgumentsHost {
    return new HttpArgumentsHostImpl(this.context);
  }
}

export const createExecutionContext = (
  context: Context,
  container: DependencyContainer,
  target: any,
  handler: Function,
): FrameworkExecutionContext => new FrameworkExecutionContext(context, container, target, handler);
