import type { Context } from 'hono'
import { injectable } from 'tsyringe'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  BadRequestException,
  Body,
  Controller,
  createZodDto,
  createZodSchemaDto,
  createZodValidationPipe,
  FrameworkResponse,
  Get,
  getControllerMetadata,
  getModuleMetadata,
  getRouteArgsMetadata,
  getRoutesMetadata,
  getZodSchema,
  Headers,
  HttpContext,
  HttpException,
  Module,
  Param,
  Query,
  Req,
  RouteParamtypes,
  ZodSchema,
  ZodValidationPipe,
} from '../src'
import {
  EXCEPTION_FILTERS_METADATA,
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  PIPES_METADATA,
  ROUTE_ARGS_METADATA,
} from '../src/constants'
import { getEnhancerMetadata, UseFilters, UseGuards, UseInterceptors, UsePipes } from '../src/decorators/enhancers'
import type {
  ArgumentsHost,
  CallHandler,
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
  async intercept(_context, next: CallHandler): Promise<FrameworkResponse> {
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

    const metadata = getControllerMetadata(PlainController as unknown as typeof DemoController)
    expect(metadata.prefix).toBe('')
    expect(getRoutesMetadata(PlainController as unknown as typeof DemoController)).toEqual([])
  })

  it('tracks enhancers on classes and methods', () => {
    const classGuards = getEnhancerMetadata(GUARDS_METADATA, DemoController)
    const classInterceptors = getEnhancerMetadata(INTERCEPTORS_METADATA, DemoController)
    const methodPipes = getEnhancerMetadata(PIPES_METADATA, DemoController.prototype, 'handler')
    const methodFilters = getEnhancerMetadata(EXCEPTION_FILTERS_METADATA, DemoController.prototype, 'handler')

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

    Reflect.defineMetadata(ROUTE_ARGS_METADATA, [metadataItem], ParamController.prototype, 'method')

    const metadata = getRouteArgsMetadata(ParamController.prototype, 'method')
    expect(metadata[0].type).toBe(RouteParamtypes.CUSTOM)
  })

  it('gracefully handles missing design:paramtypes metadata', () => {
    class ManualOnlyController {
      // No decorators here to prevent TypeScript from emitting param metadata
      handler(_value: unknown) {}
    }

    const metadataItem = {
      index: 0,
      type: RouteParamtypes.CUSTOM,
      data: 'manual',
      pipes: [],
      factory: () => 'value',
    }

    Reflect.defineMetadata(ROUTE_ARGS_METADATA, [metadataItem], ManualOnlyController.prototype, 'handler')

    const metadata = getRouteArgsMetadata(ManualOnlyController.prototype, 'handler')

    expect(metadata[0].metatype).toBeUndefined()
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
    expect(() => HttpContext.setContext(createContext())).toThrowError(/Cannot set context/)
  })

  it('creates configurable zod validation pipe for DTOs', () => {
    const schema = z
      .object({
        name: z.string({ required_error: 'required' }).min(1, 'required'),
      })
      .describe('Payload')

    @ZodSchema(schema)
    class PayloadDto {
      name!: string
    }

    const PipeCtor = createZodValidationPipe({
      errorHttpStatusCode: 422,
      enableDebugMessages: true,
      stopAtFirstError: true,
    })
    const pipe = new PipeCtor()

    const output = pipe.transform({ name: 'demo' }, { type: 'body', metatype: PayloadDto })

    expect(output).toBeInstanceOf(PayloadDto)
    expect(output).toMatchObject({ name: 'demo' })

    try {
      pipe.transform({}, { type: 'body', metatype: PayloadDto })
      throw new Error('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      const response = (error as HttpException).getResponse<{
        statusCode: number
        errors: Record<string, string[]>
        meta: Record<string, unknown>
      }>()
      expect(response.statusCode).toBe(422)
      expect(response.errors.name).toEqual([expect.stringContaining('expected string')])
      expect(response.meta.target).toBe('PayloadDto')
    }
  })

  it('relaxes schemas when whitelist is disabled', () => {
    @ZodSchema(
      z.object({
        name: z.string(),
      }),
    )
    class RelaxedDto {
      name!: string
    }

    const pipe = new ZodValidationPipe({ whitelist: false, transform: false })
    const result = pipe.transform({ name: 'test', extra: 'value' }, { type: 'body', metatype: RelaxedDto }) as Record<
      string,
      unknown
    >

    expect(result.extra).toBe('value')

    expect(() => pipe.transform('string', { type: 'body', metatype: RelaxedDto })).toThrow(HttpException)
  })

  it('skips transformation for primitive payloads and aggregates errors', () => {
    @ZodSchema(z.string().min(3, 'too short'))
    class StringDto {
      value!: string
    }

    const pipe = new ZodValidationPipe({
      transform: true,
      whitelist: false,
      forbidUnknownValues: false,
      stopAtFirstError: false,
    })

    const ok = pipe.transform('valid', {
      type: 'body',
      metatype: StringDto,
    })
    expect(ok).toBe('valid')

    try {
      pipe.transform('no', { type: 'body', metatype: StringDto })
      throw new Error('Expected validation failure')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      const response = (error as HttpException).getResponse<{
        errors: Record<string, string[]>
      }>()
      expect(response.errors.root).toContain('too short')
    }
  })

  it('omits debug metadata when diagnostics are disabled', () => {
    @ZodSchema(z.object({ label: z.string().min(2) }))
    class MinimalDto {
      label!: string
    }

    const pipe = new ZodValidationPipe({ enableDebugMessages: false })

    try {
      pipe.transform({}, { type: 'body', metatype: MinimalDto })
      throw new Error('Expected validation error')
    } catch (error) {
      const response = (error as HttpException).getResponse<Record<string, unknown>>()
      expect(response).not.toHaveProperty('meta')
    }

    try {
      pipe.transform(null, { type: 'body', metatype: MinimalDto })
      throw new Error('Expected validation error')
    } catch (error) {
      const response = (error as HttpException).getResponse<Record<string, unknown>>()
      expect(response).not.toHaveProperty('meta')
    }
  })

  it('derives configured pipe class names from transform option', () => {
    const PassivePipe = createZodValidationPipe({ transform: false })
    const ActivePipe = createZodValidationPipe()

    expect(PassivePipe.name).toBe('ZodValidationPipe_Passive')
    expect(ActivePipe.name).toBe('ZodValidationPipe_Active')
  })

  it('creates execution contexts exposing handler and class', () => {
    const handler = () => {}
    const honoContext = createContext()
    const container = {} as any

    const executionContext = createExecutionContext(honoContext, container, DemoController, handler)

    expect(executionContext.getClass()).toBe(DemoController)
    expect(executionContext.getHandler()).toBe(handler)
    expect(executionContext.getContext()).toBe(honoContext)
    expect(executionContext.switchToHttp().getContext()).toBe(honoContext)
  })
})

it('derives DTO class names from schema descriptions', () => {
  const described = z.object({ value: z.string() }).describe('Sample')
  const DescribedDto = createZodDto(described)
  expect(DescribedDto.name).toBe('SampleDto')

  const anonymous = z.object({ value: z.string() })
  const AnonymousDto = createZodDto(anonymous)
  expect(AnonymousDto.name).toBe('AnonymousZodDto')

  const instance = new DescribedDto({ value: 'hello' })
  expect(instance).toBeInstanceOf(DescribedDto)
  expect((instance as any).value).toBe('hello')
})

it('returns untransformed values when metatype is missing', () => {
  const pipe = new ZodValidationPipe({ transform: true })
  const result = pipe.transform('raw', { type: 'query', data: 'test' })
  expect(result).toBe('raw')
})

it('creates extendable DTO classes with schema metadata', () => {
  const schema = z.object({ id: z.number(), label: z.string() }).describe('Extend')
  class ExtendedDto extends createZodSchemaDto(schema) {}

  const dto = new ExtendedDto({ id: 1, label: 'test' })
  expect(dto).toEqual({ id: 1, label: 'test' })
  expect(getZodSchema(ExtendedDto)).toBe(schema)
})

it('allows overriding DTO class names when creating from schema', () => {
  const schema = z.object({ value: z.boolean() })
  const CustomDto = createZodSchemaDto(schema, { name: 'CustomZodDto' })

  expect(CustomDto.name).toBe('CustomZodDto')
  const dto = new CustomDto({ value: true })
  expect(dto).toEqual({ value: true })
})
