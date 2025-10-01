import type { Context } from 'hono'
import { injectable } from 'tsyringe'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  BadRequestException,
  Body,
  Controller,
  createZodValidationPipe,
  Get,
  getControllerMetadata,
  getModuleMetadata,
  getRouteArgsMetadata,
  getRoutesMetadata,
  Headers,
  HttpContext,
  HttpException,
  Module,
  Param,
  Query,
  Req,
  RouteParamtypes,
} from '../src'
import {
  EXCEPTION_FILTERS_METADATA,
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  PIPES_METADATA,
  ROUTE_ARGS_METADATA,
} from '../src/constants'
import {
  getEnhancerMetadata,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '../src/decorators/enhancers'
import type {
  ArgumentsHost,
  CanActivate,
  ExceptionFilter,
  NestInterceptor,
  PipeTransform,
} from '../src/interfaces'
import { createExecutionContext } from '../src/utils/execution-context'

@Module({
  controllers: [],
  providers: [],
})
class EmptyModule {}

@injectable()
class DummyGuard implements CanActivate {
  canActivate(): boolean {
    return true
  }
}

@injectable()
class DummyPipe implements PipeTransform<unknown> {
  transform(value: unknown): unknown {
    return value
  }
}

@injectable()
class DummyInterceptor implements NestInterceptor {
  async intercept(_context, next) {
    return next.handle()
  }
}

@injectable()
class DummyFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    return host.getContext().json({ handled: exception instanceof Error })
  }
}

@Controller('demo')
@UseGuards(DummyGuard)
@UseInterceptors(DummyInterceptor)
class DemoController {
  @Get('/')
  @UsePipes(DummyPipe)
  @UseFilters(DummyFilter)
  handler(
    @Query('name') _name: string,
    @Param('id') _id: string,
    @Headers('x-test') _header: string,
    @Req() _request: Request,
  ) {}
}

@Controller()
class ParamController {
  method(@Body() _body: unknown) {}
}

const createContext = () => ({ id: Math.random() }) as unknown as Context

describe('decorators and helpers', () => {
  it('stores module metadata', () => {
    const metadata = getModuleMetadata(EmptyModule)
    expect(metadata.controllers).toEqual([])
    expect(metadata.providers).toEqual([])
  })

  it('stores controller metadata and routes', () => {
    const controllerMetadata = getControllerMetadata(DemoController)
    expect(controllerMetadata.prefix).toBe('demo')

    const routes = getRoutesMetadata(DemoController)
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({
      method: 'GET',
      path: '/',
      handlerName: 'handler',
    })
  })

  it('provides defaults when controller metadata is missing', () => {
    class PlainController {}

    const metadata = getControllerMetadata(
      PlainController as unknown as typeof DemoController,
    )
    expect(metadata.prefix).toBe('')
    expect(
      getRoutesMetadata(PlainController as unknown as typeof DemoController),
    ).toEqual([])
  })

  it('tracks enhancers on classes and methods', () => {
    const classGuards = getEnhancerMetadata(GUARDS_METADATA, DemoController)
    const classInterceptors = getEnhancerMetadata(
      INTERCEPTORS_METADATA,
      DemoController,
    )
    const methodPipes = getEnhancerMetadata(
      PIPES_METADATA,
      DemoController.prototype,
      'handler',
    )
    const methodFilters = getEnhancerMetadata(
      EXCEPTION_FILTERS_METADATA,
      DemoController.prototype,
      'handler',
    )

    expect(classGuards).toEqual([DummyGuard])
    expect(classInterceptors).toEqual([DummyInterceptor])
    expect(methodPipes).toEqual([DummyPipe])
    expect(methodFilters).toEqual([DummyFilter])
  })

  it('collects parameter metadata with types', () => {
    const metadata = getRouteArgsMetadata(DemoController.prototype, 'handler')
    expect(metadata).toHaveLength(4)
    const types = metadata.map((item) => item.type)
    expect(types).toContain(RouteParamtypes.QUERY)
    expect(types).toContain(RouteParamtypes.PARAM)
    expect(types).toContain(RouteParamtypes.HEADERS)
    expect(types).toContain(RouteParamtypes.REQUEST)
  })

  it('supports manual metadata extensions', () => {
    const metadataItem = {
      index: 0,
      type: RouteParamtypes.CUSTOM,
      data: 'custom',
      pipes: [],
      factory: () => 'value',
    }

    Reflect.defineMetadata(
      ROUTE_ARGS_METADATA,
      [metadataItem],
      ParamController.prototype,
      'method',
    )

    const metadata = getRouteArgsMetadata(ParamController.prototype, 'method')
    expect(metadata[0].type).toBe(RouteParamtypes.CUSTOM)
  })

  it('wraps http exceptions with status and response', () => {
    const base = new HttpException({ message: 'base' }, 499)
    expect(base.getStatus()).toBe(499)
    expect(base.getResponse()).toEqual({ message: 'base' })

    const child = new BadRequestException('custom')
    expect(child.getStatus()).toBe(400)
  })

  it('manages HttpContext storage with async_hooks', async () => {
    await HttpContext.run(createContext(), async () => {
      const ctx = HttpContext.get<Context>()
      expect(ctx).toHaveProperty('id')
      HttpContext.setContext(ctx)
      expect(HttpContext.get()).toBe(ctx)
    })

    expect(() => HttpContext.get()).toThrowError(/not available/)
    expect(() => HttpContext.setContext(createContext())).toThrowError(
      /Cannot set context/,
    )
  })

  it('creates zod validation pipe for bodies', () => {
    const schema = z
      .object({
        name: z.string({ required_error: 'required' }).min(1, 'required'),
      })
      .describe('Schema')
    const Pipe = createZodValidationPipe(schema)
    const pipe = new Pipe()

    expect(Pipe.name).toBe('ZodValidationPipe_Schema')

    const output = pipe.transform({ name: 'demo' }, { type: 'body' })
    expect(output).toEqual({ name: 'demo' })

    try {
      pipe.transform({}, { type: 'body', data: 'payload' })
      throw new Error('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException)
      const badRequest = error as InstanceType<typeof BadRequestException>
      expect(badRequest.getResponse()).toMatchObject({
        details: {
          errors: {
            name: ['required'],
          },
        },
      })
    }
  })

  it('creates execution contexts exposing handler and class', () => {
    const handler = () => {}
    const honoContext = createContext()
    const container = {} as any

    const executionContext = createExecutionContext(
      honoContext,
      container,
      DemoController,
      handler,
    )

    expect(executionContext.getClass()).toBe(DemoController)
    expect(executionContext.getHandler()).toBe(handler)
    expect(executionContext.getContext()).toBe(honoContext)
    expect(executionContext.switchToHttp().getContext()).toBe(honoContext)
  })
})

it('names zod validation pipe anonymous when description missing', () => {
  const schema = z.object({ value: z.string() })
  const Pipe = createZodValidationPipe(schema)

  expect(Pipe.name).toBe('ZodValidationPipe_Anonymous')
})
