import 'reflect-metadata'

import type { Context } from 'hono'
import { Hono } from 'hono'
import colors from 'picocolors'
import type { DependencyContainer, InjectionToken } from 'tsyringe'
import { container as rootContainer } from 'tsyringe'

import { isDebugEnabled } from './constants'
import { HttpContext } from './context/http-context'
import { getControllerMetadata } from './decorators/controller'
import { getRoutesMetadata } from './decorators/http-methods'
import { getModuleMetadata, resolveModuleImports } from './decorators/module'
import { getRouteArgsMetadata } from './decorators/params'
import { BadRequestException, ForbiddenException, HttpException } from './http-exception'
import type {
  ArgumentMetadata,
  CallHandler,
  CanActivate,
  Constructor,
  ExceptionFilter,
  FrameworkResponse,
  GlobalEnhancerRegistry,
  NestInterceptor,
  PipeTransform,
  RouteParamMetadataItem,
} from './interfaces'
import { RouteParamtypes } from './interfaces'
import type { PrettyLogger } from './logger'
import { createLogger } from './logger'
import { createExecutionContext } from './utils/execution-context'
import { collectFilters, collectGuards, collectInterceptors, collectPipes } from './utils/metadata'

const GENERATED_RESPONSE = Symbol.for('hono.framework.generatedResponse')

export interface ApplicationOptions {
  container?: DependencyContainer
  globalPrefix?: string
  logger?: PrettyLogger
}

function createDefaultRegistry(): GlobalEnhancerRegistry {
  return {
    guards: [],
    pipes: [],
    interceptors: [],
    filters: [],
  }
}

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

export class HonoHttpApplication {
  private readonly app = new Hono()
  private readonly container: DependencyContainer
  private readonly globalEnhancers: GlobalEnhancerRegistry = createDefaultRegistry()
  private readonly registeredModules = new Set<Constructor>()
  private readonly logger: PrettyLogger
  private readonly diLogger: PrettyLogger
  private readonly routerLogger: PrettyLogger
  private readonly moduleName: string

  constructor(
    private readonly rootModule: Constructor,
    private readonly options: ApplicationOptions = {},
  ) {
    this.logger = options.logger ?? createLogger('Framework')
    this.diLogger = this.logger.extend('DI')
    this.routerLogger = this.logger.extend('Router')
    const rawModuleName = (this.rootModule as Function).name
    this.moduleName = rawModuleName && rawModuleName.trim().length > 0 ? rawModuleName : 'AnonymousModule'
    this.container = options.container ?? rootContainer.createChildContainer()
    this.logger.info(
      `Initialized application container for module ${this.moduleName}`,
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  async init(): Promise<void> {
    this.logger.info(`Bootstrapping application for module ${this.moduleName}`)
    await this.registerModule(this.rootModule)
    this.logger.info(
      `Application initialization complete for module ${this.moduleName}`,
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  getInstance(): Hono {
    return this.app
  }

  getContainer(): DependencyContainer {
    return this.container
  }

  private resolveInstance<T>(token: Constructor<T>): T {
    try {
      return this.container.resolve(token as unknown as InjectionToken<T>)
    } catch (error) {
      /* c8 ignore start */
      if (error instanceof Error && error.message.includes('Cannot inject the dependency ')) {
        // Cannot inject the dependency "appService" at position #0 of "AppController" constructor.
        const regexp = /Cannot inject the dependency "([^"]+)" at position #(\d+) of "([^"]+)" constructor\./
        const match = error.message.match(regexp)
        if (match) {
          const [, dependency, position, constructor] = match
          throw new ReferenceError(
            `Cannot inject the dependency ${colors.yellow(dependency)} at position #${position} of "${colors.yellow(constructor)}" constructor.` +
              `\n` +
              `Please check if the dependency is registered in the container. Check import the dependency not the type.` +
              `\n${colors.red(`- import type { ${dependency} } from "./service";`)}\n${colors.green(
                `+ import { ${dependency} } from "./service";`,
              )}`,
          )
        }
      }
      throw error
      /* c8 ignore end */
    }
  }

  private registerSingleton<T>(token: Constructor<T>): void {
    const injectionToken = token as unknown as InjectionToken<T>
    if (!this.container.isRegistered(injectionToken, true)) {
      this.container.registerSingleton(injectionToken, token)
      const providerName = token.name && token.name.length > 0 ? token.name : token.toString()
      this.diLogger.debug(
        'Registered singleton provider',
        colors.yellow(providerName),
        colors.green(`+${performance.now().toFixed(2)}ms`),
      )
    }
  }

  useGlobalGuards(...guards: Array<Constructor<CanActivate>>): void {
    this.globalEnhancers.guards.push(...guards)
  }

  useGlobalPipes(...pipes: Array<Constructor<PipeTransform>>): void {
    this.globalEnhancers.pipes.push(...pipes)
  }

  useGlobalInterceptors(...interceptors: Array<Constructor<NestInterceptor>>): void {
    this.globalEnhancers.interceptors.push(...interceptors)
  }

  useGlobalFilters(...filters: Array<Constructor<ExceptionFilter>>): void {
    this.globalEnhancers.filters.push(...filters)
  }

  private async registerModule(moduleClass: Constructor): Promise<void> {
    if (this.registeredModules.has(moduleClass)) {
      return
    }

    this.registeredModules.add(moduleClass)
    this.logger.debug('Registering module', moduleClass.name)

    const metadata = getModuleMetadata(moduleClass)

    for (const importedModule of resolveModuleImports(metadata.imports)) {
      await this.registerModule(importedModule)
    }

    for (const provider of metadata.providers ?? []) {
      this.registerSingleton(provider as Constructor)
    }

    for (const controller of metadata.controllers ?? []) {
      this.registerSingleton(controller as Constructor)

      this.registerController(controller)
    }

    this.logger.debug(
      'Module registration complete',
      colors.yellow(moduleClass.name),
      colors.green(`+${performance.now().toFixed(2)}ms`),
    )
  }

  private registerController(controller: Constructor): void {
    const controllerInstance = this.resolveInstance(controller)
    const { prefix } = getControllerMetadata(controller)
    const routes = getRoutesMetadata(controller)

    for (const route of routes) {
      const method = route.method.toUpperCase() as HTTPMethod
      const fullPath = this.buildPath(prefix, route.path)

      this.app.on(method, fullPath, async (context: Context) => {
        return await HttpContext.run(context, async () => {
          const handler = Reflect.get(controllerInstance, route.handlerName) as (...args: any[]) => any
          const executionContext = createExecutionContext(this.container, controller, handler)

          try {
            await this.executeGuards(controller, route.handlerName, executionContext)

            const response = await this.executeInterceptors(
              controller,
              route.handlerName,
              executionContext,
              async () => {
                const args = await this.resolveArguments(
                  controller,
                  route.handlerName,
                  handler,
                  context,
                  executionContext,
                )
                const result = await handler.apply(controllerInstance, args)
                return this.transformResult(context, result)
              },
            )

            return response
          } catch (error) {
            return await this.handleException(controller, route.handlerName, error, executionContext, context)
          }
        })
      })

      this.routerLogger.info(
        `Mapped route ${method} ${fullPath} -> ${controller.name}.${String(route.handlerName)}`,

        colors.green(`+${performance.now().toFixed(2)}ms`),
      )
    }
  }

  private buildPath(prefix: string, routePath: string): string {
    const globalPrefix = this.options.globalPrefix ?? ''
    const pieces = [globalPrefix, prefix, routePath]
      .map((segment) => segment?.trim())
      .filter(Boolean)
      .map((segment) => (segment!.startsWith('/') ? segment : `/${segment}`))

    const normalized = pieces.join('').replaceAll(/[\\/]+/g, '/')
    if (normalized.length > 1 && normalized.endsWith('/')) {
      return normalized.slice(0, -1)
    }

    return normalized || '/'
  }

  private async executeGuards(
    controller: Constructor,
    handlerName: string | symbol,
    context: ReturnType<typeof createExecutionContext>,
  ): Promise<void> {
    const guardCtors = [...this.globalEnhancers.guards, ...collectGuards(controller, handlerName)]

    for (const guardCtor of guardCtors) {
      const guard = this.resolveInstance(guardCtor)
      const canActivate = await guard.canActivate(context)
      if (!canActivate) {
        this.logger.warn(`Guard ${guardCtor.name} blocked ${controller.name}.${String(handlerName)} execution`)
        throw new ForbiddenException()
      }
    }
  }

  private async executeInterceptors(
    controller: Constructor,
    handlerName: string | symbol,
    executionContext: ReturnType<typeof createExecutionContext>,
    finalHandler: () => Promise<unknown>,
  ): Promise<Response> {
    const interceptorCtors = [...this.globalEnhancers.interceptors, ...collectInterceptors(controller, handlerName)]

    const honoContext = HttpContext.getValue('hono')

    const callHandler: CallHandler = {
      handle: async (): Promise<FrameworkResponse> => this.ensureResponse(honoContext, await finalHandler()),
    }

    const interceptors = interceptorCtors.map((ctor) => this.resolveInstance(ctor)).reverse()

    const dispatch: CallHandler = interceptors.reduce(
      (next, interceptor): CallHandler => ({
        handle: () => Promise.resolve(interceptor.intercept(executionContext, next)),
      }),
      callHandler,
    )

    const result = await dispatch.handle()
    return this.ensureResponse(honoContext, result)
  }

  private async handleException(
    controller: Constructor,
    handlerName: string | symbol,
    error: unknown,
    executionContext: ReturnType<typeof createExecutionContext>,
    context: Context,
  ): Promise<Response> {
    const filterCtors = [...this.globalEnhancers.filters, ...collectFilters(controller, handlerName)]
    for (const filterCtor of filterCtors) {
      const filter = this.resolveInstance(filterCtor)
      const maybeResponse = await filter.catch(error as Error, executionContext)
      if (maybeResponse) {
        return this.ensureResponse(context, maybeResponse)
      }
    }

    if (error instanceof HttpException) {
      return this.json(context, error.getResponse(), error.getStatus())
    }

    const message =
      error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim() : String(error)
    this.logger.error(`Unhandled error ${message}`)
    const response = {
      statusCode: 500,
      message: 'Internal server error',
    }

    return this.json(context, response, 500)
  }

  private transformResult(context: Context, result: unknown): unknown {
    if (result === undefined) {
      return context.res
    }

    return result
  }

  private ensureResponse(context: Context, payload: unknown): Response {
    if (payload instanceof Response) {
      return payload
    }

    if (payload === context.res) {
      return context.res
    }

    if (payload === undefined) {
      return context.res
    }

    if (typeof payload === 'string') {
      return this.markGeneratedResponse(new Response(payload as BodyInit))
    }

    if (payload instanceof ArrayBuffer) {
      return this.markGeneratedResponse(new Response(payload as BodyInit))
    }

    if (ArrayBuffer.isView(payload)) {
      return this.markGeneratedResponse(new Response(payload as BodyInit))
    }

    if (payload instanceof ReadableStream) {
      return this.markGeneratedResponse(new Response(payload))
    }

    return this.markGeneratedResponse(context.json(payload))
  }

  private json(context: Context, payload: unknown, status: number): Response {
    const normalizedPayload = payload === undefined ? null : payload
    return new Response(JSON.stringify(normalizedPayload), {
      status,
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  private markGeneratedResponse(response: Response): Response {
    Reflect.set(response as unknown as Record<PropertyKey, unknown>, GENERATED_RESPONSE, true)
    return response
  }

  private getGlobalAndHandlerPipes(controller: Constructor, handlerName: string | symbol): PipeTransform[] {
    const pipeCtors = [...this.globalEnhancers.pipes, ...collectPipes(controller, handlerName)]

    return pipeCtors.map((ctor) => this.resolveInstance(ctor))
  }

  private async resolveArguments(
    controller: Constructor,
    handlerName: string | symbol,
    handler: Function,
    context: Context,
    executionContext: ReturnType<typeof createExecutionContext>,
  ): Promise<unknown[]> {
    const paramsMetadata = this.getParametersMetadata(controller, handlerName, handler, context)
    if (isDebugEnabled()) {
      this.logger.debug('Resolved params metadata', {
        controller: controller.name,
        handler: handlerName.toString(),
        paramsMetadata,
      })
    }
    const maxIndex = paramsMetadata.length > 0 ? Math.max(...paramsMetadata.map((item) => item.index)) : -1
    const args: unknown[] = Array.from({ length: maxIndex + 1 })
    const sharedPipes = this.getGlobalAndHandlerPipes(controller, handlerName)

    // console.debug('Params metadata', controller.name, handlerName, paramsMetadata);
    for (const metadata of paramsMetadata) {
      const value = await this.resolveParameterValue(metadata, context, executionContext)
      const transformed = await this.applyPipes(value, metadata, sharedPipes)
      args[metadata.index] = transformed
    }

    return args.length > 0 ? args : [context]
  }

  /* c8 ignore start */
  private getParametersMetadata(
    controller: Constructor,
    handlerName: string | symbol,
    handler: Function,
    context: Context,
  ): RouteParamMetadataItem[] {
    const controllerMetadata = getRouteArgsMetadata(controller.prototype, handlerName)
    const paramTypes: Constructor[] = (Reflect.getMetadata('design:paramtypes', controller.prototype, handlerName) ||
      []) as Constructor[]
    const handlerParamLength = handler.length

    const indexed = new Map<number, RouteParamMetadataItem>()

    for (const metadata of controllerMetadata) {
      indexed.set(metadata.index, {
        ...metadata,
        metatype: metadata.metatype ?? paramTypes[metadata.index],
      })
    }

    const potentialIndexes = [...indexed.keys(), paramTypes.length - 1, handlerParamLength - 1, -1]

    let maxIndex = -1
    for (const value of potentialIndexes) {
      if (value > maxIndex) {
        maxIndex = value
      }
    }

    const items: RouteParamMetadataItem[] = []

    if (maxIndex < 0) {
      return items
    }

    for (let index = 0; index <= maxIndex; index += 1) {
      const existing = indexed.get(index)
      if (existing) {
        items.push(existing)
      } else {
        const shouldInferContext = index < Math.max(paramTypes.length, handlerParamLength) && handlerParamLength > 0
        if (isDebugEnabled()) {
          this.logger.debug('Inferred context parameter', {
            controller: controller.name,
            handler: handlerName.toString(),
            index,
            paramTypesLength: paramTypes.length,
            handlerParamLength,
          })
        }
        if (shouldInferContext) {
          items.push({
            index,
            type: RouteParamtypes.CONTEXT,
            metatype: paramTypes[index] ?? context.constructor,
          })
        }
      }
    }

    return items.sort((a, b) => a.index - b.index)
  }
  /* c8 ignore end */

  private async resolveParameterValue(
    metadata: RouteParamMetadataItem,
    context: Context,
    executionContext: ReturnType<typeof createExecutionContext>,
  ): Promise<unknown> {
    if (metadata.factory) {
      return metadata.factory(context, executionContext)
    }

    switch (metadata.type) {
      case RouteParamtypes.REQUEST: {
        return context.req
      }
      case RouteParamtypes.BODY: {
        return await this.readBody(context)
      }
      case RouteParamtypes.QUERY: {
        return metadata.data ? context.req.query(metadata.data) : context.req.query()
      }
      case RouteParamtypes.PARAM: {
        return metadata.data ? context.req.param(metadata.data) : context.req.param()
      }
      case RouteParamtypes.HEADERS: {
        if (metadata.data) {
          return context.req.header(metadata.data)
        }
        return context.req.raw.headers
      }

      default: {
        return context
      }
    }
  }

  private async applyPipes(
    value: unknown,
    metadata: RouteParamMetadataItem,
    sharedPipes: PipeTransform[],
  ): Promise<unknown> {
    const paramPipes = (metadata.pipes || []).map((ctor) => this.resolveInstance(ctor))
    const pipes = [...sharedPipes, ...paramPipes]

    if (pipes.length === 0) {
      return value
    }

    const argumentMetadata: ArgumentMetadata = {
      type: metadata.type,
      data: metadata.data,
      metatype: metadata.metatype,
    } as ArgumentMetadata

    let currentValue = value
    for (const pipe of pipes) {
      currentValue = await pipe.transform(currentValue, argumentMetadata)
    }

    return currentValue
  }

  private async readBody(context: Context): Promise<unknown> {
    const cacheKey = '__framework_cached_body__'
    if (context.get(cacheKey) !== undefined) {
      return context.get(cacheKey)
    }

    const contentType = context.req.header('content-type') ?? ''

    if (!contentType.includes('application/json')) {
      context.set(cacheKey, null)
      return null
    }

    try {
      const body = await context.req.json<unknown>()
      context.set(cacheKey, body)
      return body
    } catch (error) {
      throw new BadRequestException(
        {
          statusCode: 400,
          message: 'Invalid JSON payload',
        },
        'Invalid JSON payload',
        { cause: error },
      )
    }
  }
}

export async function createApplication(
  rootModule: Constructor,
  options: ApplicationOptions = {},
): Promise<HonoHttpApplication> {
  const app = new HonoHttpApplication(rootModule, options)
  await app.init()
  return app
}
