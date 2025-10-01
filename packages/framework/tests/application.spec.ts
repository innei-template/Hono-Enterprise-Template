import { ReadableStream } from 'node:stream/web'
import type { Context } from 'hono'
import { describe, beforeAll, beforeEach, expect, it } from 'vitest'
import { inject, injectable } from 'tsyringe'
import {
  Body,
  ContextParam,
  Controller,
  Delete,
  Get,
  Headers,
  HttpContext,
  Module,
  Param,
  Post,
  Query,
  Req,
  RouteParamtypes,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  createApplication,
  HonoHttpApplication,
  createLogger,
  createZodValidationPipe,
  BadRequestException,
  type CanActivate,
  type ExceptionFilter,
  type ExecutionContext,
  type NestInterceptor,
  type PipeTransform,
  type RouteParamMetadataItem,
  type Constructor,
} from '../src'
import type { CallHandler } from '../src/interfaces'
import type { ArgumentsHost } from '../src/interfaces'
import { z } from 'zod'
import { ROUTE_ARGS_METADATA } from '../src/constants'

const BASE_URL = 'http://localhost'

const createRequest = (path: string, init?: RequestInit) =>
  new Request(`${BASE_URL}${path}`, init)

const callOrder: string[] = []

const FactoryParam =
  () =>
  (target: object, propertyKey: string | symbol, parameterIndex: number) => {
    const existing = (Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      target,
      propertyKey,
    ) || []) as RouteParamMetadataItem[]
    existing.push({
      index: parameterIndex,
      type: RouteParamtypes.CUSTOM,
      pipes: [],
      factory: () => 'factory-value',
    })
    Reflect.defineMetadata(ROUTE_ARGS_METADATA, existing, target, propertyKey)
  }

@injectable()
class SharedService {
  getValue() {
    return 'shared'
  }
}

@injectable()
class DemoService {
  constructor(@inject(SharedService) private readonly shared: SharedService) {}

  greet(name: string) {
    return `Hello ${name.toUpperCase()} from ${this.shared.getValue()}`
  }
}

@injectable()
class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    callOrder.push('global-guard')
    const honoContext = context.getContext<Context>()
    expect(HttpContext.get<Context>()).toBe(honoContext)
    return honoContext.req.header('x-api-key') === 'test-key'
  }
}

@injectable()
class AllowGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    callOrder.push('method-guard')
    return context.getContext<Context>().req.header('x-allow') === 'yes'
  }
}

@injectable()
class GlobalPipe implements PipeTransform<unknown> {
  transform(value: unknown, metadata) {
    callOrder.push(`pipe-${metadata.type}`)
    if (metadata.type === 'query' && typeof value === 'string') {
      return `${value}-global`
    }
    return value
  }
}

@injectable()
class DoublePipe implements PipeTransform<unknown, number> {
  transform(value: unknown) {
    callOrder.push('double-pipe')
    const parsed = Number(value)
    if (Number.isNaN(parsed)) {
      throw new BadRequestException('NaN')
    }
    return parsed * 2
  }
}

@injectable()
class GlobalInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    callOrder.push('global-interceptor-before')
    const result = await next.handle()
    callOrder.push('global-interceptor-after')
    return result
  }
}

@injectable()
class MethodInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    callOrder.push('method-interceptor-before')
    const result = await next.handle()
    callOrder.push('method-interceptor-after')
    if (typeof result === 'string') {
      return `${result}|intercepted`
    }
    return result
  }
}

class CustomError extends Error {}

class StacklessError extends Error {
  constructor() {
    super('stackless')
    this.stack = undefined
  }
}

@injectable()
class GlobalExceptionFilter implements ExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof CustomError) {
      const ctx = host.getContext<Context>()
      return ctx.json({ handled: 'custom' }, 418)
    }
    return undefined
  }
}

@injectable()
class MethodExceptionFilter implements ExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.getContext<Context>()
    return ctx.json(
      {
        handled: true,
        message: (exception as Error).message,
      },
      422,
    )
  }
}

const BodySchema = z
  .object({
    message: z.string(),
    tags: z.array(z.string()).default([]),
  })
  .describe('BodySchema')

const ZodBodyPipe = createZodValidationPipe(BodySchema)

@injectable()
@Controller('demo')
@UseInterceptors(MethodInterceptor)
class DemoController {
  constructor(@inject(DemoService) private readonly service: DemoService) {}

  @Get('/')
  async greet(
    @Query('name') name: string,
    @Headers('x-extra') header: string | undefined,
    @ContextParam() contextParam: Context,
    @Req() request: Request,
    context: Context,
  ) {
    expect(contextParam).toBe(context)
    expect((request as any).raw).toBeInstanceOf(Request)
    HttpContext.setContext(context)
    return `${this.service.greet(name)}|header:${header ?? 'none'}`
  }

  @Get('/guarded')
  @UseGuards(AllowGuard)
  guarded() {
    return 'guarded'
  }

  @Get('/raw')
  raw(context: Context) {
    const response = context.newResponse('raw-body')
    context.res = response
    return context.res
  }

  @Get('/buffer')
  buffer() {
    return new TextEncoder().encode('buffer')
  }

  @Get('/array-buffer')
  arrayBuffer() {
    return new ArrayBuffer(16)
  }

  @Get('/stream')
  stream() {
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('stream-data'))
        controller.close()
      },
    })
  }

  @Get('/http-error')
  httpError() {
    throw new BadRequestException({ message: 'bad' })
  }

  @Get('/global-error')
  globalError() {
    throw new Error('boom')
  }

  @Get('/stackless-error')
  stacklessError() {
    throw new StacklessError()
  }

  @Get('/string-error')
  stringError() {
    throw 'string failure'
  }

  @Get('/custom-error')
  throwCustom() {
    throw new CustomError('custom')
  }

  @Get('/void')
  voidRoute() {}

  @Get('/full-query')
  fullQuery(@Query() query: Record<string, string | undefined>) {
    return query
  }

  @Get('/full-params/:id/:slug')
  fullParams(@Param() params: Record<string, string>) {
    return params
  }

  @Post('/double/:id')
  @UseGuards(AllowGuard)
  async double(
    @Param('id', DoublePipe) id: number,
    @Body(undefined, ZodBodyPipe) payload: { message: string; tags: string[] },
    @Body() rawBody: unknown,
    @Headers() headers: Record<string, string>,
    context: Context,
  ) {
    context.header('x-double', String(id))
    return {
      id,
      payload,
      sameReference: payload === rawBody,
      headerCount: Object.keys(headers).length,
    }
  }

  @Post('/plain')
  async plain(@Body() payload: unknown) {
    return { payload }
  }

  @Post('/cache')
  async cache(@Body() first: unknown, @Body() second: unknown) {
    return { same: first === second }
  }

  @Delete('/method-filter')
  @UseFilters(MethodExceptionFilter)
  methodFilter() {
    throw new Error('broken')
  }
}

@Module({
  providers: [SharedService],
  exports: [SharedService],
})
class SharedModule {}

@Module({
  imports: [SharedModule, SharedModule],
  controllers: [DemoController],
  providers: [
    DemoService,
    ApiKeyGuard,
    AllowGuard,
    GlobalPipe,
    DoublePipe,
    GlobalInterceptor,
    MethodInterceptor,
    GlobalExceptionFilter,
    MethodExceptionFilter,
    ZodBodyPipe,
  ],
})
class RootModule {}

@injectable()
@Controller('factory')
class FactoryController {
  @Get('/')
  handle(@FactoryParam() value: string) {
    return value
  }
}

@Module({
  controllers: [FactoryController],
})
class FactoryModule {}

describe('HonoHttpApplication end-to-end', () => {
  let fetcher: (request: Request) => Promise<Response>
  let app: HonoHttpApplication

  beforeAll(async () => {
    app = await createApplication(RootModule, { globalPrefix: '/api' })
    app.useGlobalGuards(ApiKeyGuard)
    app.useGlobalPipes(GlobalPipe)
    app.useGlobalInterceptors(GlobalInterceptor)
    app.useGlobalFilters(GlobalExceptionFilter)
    fetcher = (request) => Promise.resolve(app.getInstance().fetch(request))
  })

  beforeEach(() => {
    callOrder.length = 0
  })

  const authorizedHeaders = (extra: Record<string, string> = {}) => ({
    'x-api-key': 'test-key',
    ...extra,
  })

  it('processes successful request through guards, pipes, and interceptors', async () => {
    const response = await fetcher(
      createRequest('/api/demo?name=neo', {
        headers: authorizedHeaders({ 'x-extra': 'value' }),
      }),
    )

    const text = await response.text()
    expect(text).toContain('Hello NEO-GLOBAL')
    expect(text).toContain('header:value')
    expect(text).toContain('intercepted')
    expect(callOrder[0]).toBe('global-guard')
    expect(callOrder).toContain('pipe-query')
    expect(callOrder).toContain('method-interceptor-before')
    expect(callOrder).toContain('method-interceptor-after')
    expect(callOrder.indexOf('method-interceptor-before')).toBeLessThan(
      callOrder.indexOf('method-interceptor-after'),
    )
  })

  it('enforces method guard and returns forbidden', async () => {
    const response = await fetcher(
      createRequest('/api/demo/guarded', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(403)
  })

  it('returns context response when handler yields existing response', async () => {
    const response = await fetcher(
      createRequest('/api/demo/raw', {
        headers: authorizedHeaders(),
      }),
    )
    expect(await response.text()).toBe('raw-body')
  })

  it('supports array buffer and readable stream responses', async () => {
    const bufferResponse = await fetcher(
      createRequest('/api/demo/buffer', { headers: authorizedHeaders() }),
    )
    expect(await bufferResponse.arrayBuffer()).toBeInstanceOf(ArrayBuffer)

    const arrayBufferResponse = await fetcher(
      createRequest('/api/demo/array-buffer', { headers: authorizedHeaders() }),
    )
    expect((await arrayBufferResponse.arrayBuffer()).byteLength).toBe(16)

    const streamResponse = await fetcher(
      createRequest('/api/demo/stream', { headers: authorizedHeaders() }),
    )
    expect(await streamResponse.text()).toBe('stream-data')
  })

  it('returns default response when handler does not produce a payload', async () => {
    const response = await fetcher(
      createRequest('/api/demo/void', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('handles body parsing, caching, and zod validation', async () => {
    const response = await fetcher(
      createRequest('/api/demo/double/5', {
        method: 'POST',
        headers: {
          ...authorizedHeaders({
            'x-allow': 'yes',
            'content-type': 'application/json',
          }),
        },
        body: JSON.stringify({ message: 'payload', tags: ['a'] }),
      }),
    )

    expect(response.headers.get('x-double')).toBe('10')
    const json = await response.json()
    expect(json).toMatchObject({
      id: 10,
      payload: { message: 'payload', tags: ['a'] },
      sameReference: false,
    })
  })

  it('returns null body when payload is not json', async () => {
    const response = await fetcher(
      createRequest('/api/demo/plain', {
        method: 'POST',
        headers: {
          ...authorizedHeaders(),
          'content-type': 'text/plain',
        },
        body: 'just text',
      }),
    )

    const json = await response.json()
    expect(json).toEqual({ payload: null })
  })

  it('returns null body when content-type header is missing', async () => {
    const response = await fetcher(
      createRequest('/api/demo/plain', {
        method: 'POST',
        headers: authorizedHeaders(),
      }),
    )

    expect(await response.json()).toEqual({ payload: null })
  })

  it('caches parsed body across multiple parameters', async () => {
    const response = await fetcher(
      createRequest('/api/demo/cache', {
        method: 'POST',
        headers: {
          ...authorizedHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ok: true }),
      }),
    )

    const json = await response.json()
    expect(json).toEqual({ same: true })
  })

  it('provides full query objects when decorator omits key', async () => {
    const response = await fetcher(
      createRequest('/api/demo/full-query?name=neo&role=admin', {
        headers: authorizedHeaders(),
      }),
    )

    expect(await response.json()).toMatchObject({ name: 'neo', role: 'admin' })
  })

  it('provides full params when decorator omits key', async () => {
    const response = await fetcher(
      createRequest('/api/demo/full-params/123/slug', {
        headers: authorizedHeaders(),
      }),
    )

    expect(await response.json()).toMatchObject({ id: '123', slug: 'slug' })
  })

  it('propagates http exceptions as structured json', async () => {
    const response = await fetcher(
      createRequest('/api/demo/http-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ message: 'bad' })
  })

  it('handles errors without stack traces gracefully', async () => {
    const response = await fetcher(
      createRequest('/api/demo/stackless-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      message: 'Internal server error',
    })
  })

  it('falls back to default 500 when filters do not handle error', async () => {
    const response = await fetcher(
      createRequest('/api/demo/global-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      message: 'Internal server error',
    })
  })

  it('normalizes non-error throwables to 500 responses', async () => {
    const response = await fetcher(
      createRequest('/api/demo/string-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      message: 'Internal server error',
    })
  })

  it('applies method filters overriding global behavior', async () => {
    const response = await fetcher(
      createRequest('/api/demo/method-filter', {
        method: 'DELETE',
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      handled: true,
      message: 'broken',
    })
  })

  it('handles custom filter registered globally', async () => {
    const response = await fetcher(
      createRequest('/api/demo/custom-error', {
        headers: authorizedHeaders(),
      }),
    )

    expect(response.status).toBe(418)
    expect(await response.json()).toMatchObject({ handled: 'custom' })
  })

  it('returns empty body when handler yields void', async () => {
    const response = await fetcher(
      createRequest('/api/demo/void', {
        headers: authorizedHeaders(),
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it('rejects invalid json payloads', async () => {
    const response = await fetcher(
      createRequest('/api/demo/double/5', {
        method: 'POST',
        headers: {
          ...authorizedHeaders({
            'x-allow': 'yes',
            'content-type': 'application/json',
          }),
        },
        body: '{ invalid json',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      message: 'Invalid JSON payload',
    })
  })

  it('exposes the underlying dependency container', () => {
    expect(app.getContainer()).toBeDefined()
  })

  it('emits parameter metadata logs when DEBUG_PARAMS is enabled', async () => {
    const original = Reflect.getMetadata(
      'design:paramtypes',
      DemoController.prototype,
      'greet',
    )
    Reflect.defineMetadata(
      'design:paramtypes',
      [String],
      DemoController.prototype,
      'greet',
    )
    process.env.DEBUG_PARAMS = 'true'

    try {
      const response = await fetcher(
        createRequest('/api/demo?name=params', {
          headers: authorizedHeaders({ 'x-extra': 'value', 'x-allow': 'yes' }),
        }),
      )
      expect(response.status).toBe(200)
    } finally {
      if (original) {
        Reflect.defineMetadata(
          'design:paramtypes',
          original,
          DemoController.prototype,
          'greet',
        )
      } else {
        Reflect.deleteMetadata(
          'design:paramtypes',
          DemoController.prototype,
          'greet',
        )
      }
      delete process.env.DEBUG_PARAMS
    }
  })
})

describe('HonoHttpApplication logging', () => {
  it('uses anonymous fallback module name when constructor is unnamed', async () => {
    const infoLogs: string[] = []
    const logger = createLogger('Framework', {
      colors: false,
      writer: {
        info: (...args) => infoLogs.push(args.filter(Boolean).join(' ')),
        debug: () => {},
        warn: () => {},
        error: () => {},
        log: () => {},
      },
    })

    await createApplication(class {}, { logger })

    expect(infoLogs).not.toHaveLength(0)
    infoLogs.forEach((entry) => {
      expect(entry).toContain('AnonymousModule')
    })
  })
})

describe('HonoHttpApplication parameter factories', () => {
  it('resolves values provided by metadata factories without pipes', async () => {
    const app = await createApplication(FactoryModule)

    const response = await app.getInstance().fetch(createRequest('/factory'))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('factory-value')
  })
})

describe('HonoHttpApplication internals', () => {
  it('reuses an existing response object without wrapping', async () => {
    const app = await createApplication(FactoryModule)
    const context = {
      res: { sentinel: true },
      json: () => new Response('never'),
    } as unknown as Context

    const ensureResponse = (
      app as unknown as {
        ensureResponse: (ctx: Context, payload: unknown) => Response | unknown
      }
    ).ensureResponse.bind(app)

    const result = ensureResponse(context, context.res)
    expect(result).toBe(context.res)
  })

  it('falls back to context response when payload is undefined', async () => {
    const app = await createApplication(FactoryModule)
    const baseResponse = new Response('fallback')
    const context = {
      res: baseResponse,
      json: () => new Response('never'),
    } as unknown as Context

    const ensureResponse = (
      app as unknown as {
        ensureResponse: (ctx: Context, payload: unknown) => Response | unknown
      }
    ).ensureResponse.bind(app)

    const result = ensureResponse(context, undefined)
    expect(result).toBe(baseResponse)
  })

  it('skips duplicate provider registrations', async () => {
    const app = await createApplication(FactoryModule)

    const registerSingleton = (
      app as unknown as {
        registerSingleton: (token: Constructor) => void
      }
    ).registerSingleton.bind(app)

    const Temp = class TempService {}
    const Anonymous = class {}
    Object.defineProperty(Anonymous, 'name', { value: '', configurable: true })

    registerSingleton(Temp as Constructor)
    registerSingleton(Temp as Constructor)

    registerSingleton(Anonymous as Constructor)
    registerSingleton(Anonymous as Constructor)

    expect(app.getContainer().isRegistered(Temp as Constructor, true)).toBe(true)
  })

  it('normalizes empty paths to root', async () => {
    const app = await createApplication(FactoryModule)
    const buildPath = (
      app as unknown as {
        buildPath: (prefix: string, routePath: string) => string
      }
    ).buildPath.bind(app)

    expect(buildPath('', '')).toBe('/')
  })

  it('serializes undefined payloads to null json bodies', async () => {
    const app = await createApplication(FactoryModule)
    const json = (
      app as unknown as {
        json: (ctx: Context, payload: unknown, status: number) => Response
      }
    ).json.bind(app)

    const response = json({} as Context, undefined, 200)
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })
})
