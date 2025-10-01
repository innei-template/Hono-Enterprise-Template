import type { Context } from 'hono'
import type { DependencyContainer } from 'tsyringe'

export type Constructor<T = any> = new (...args: any[]) => T

export interface ModuleMetadata {
  controllers?: Constructor[]
  providers?: Constructor[]
  imports?: Constructor[]
}

export interface CanActivate {
  canActivate: (context: ExecutionContext) => Promise<boolean> | boolean
}

export interface PipeTransform<T = unknown, R = T> {
  transform: (value: T, metadata: ArgumentMetadata) => Promise<R> | R
}

export interface ArgumentMetadata {
  type:
    | 'body'
    | 'query'
    | 'param'
    | 'context'
    | 'custom'
    | 'headers'
    | 'request'
  data?: string
  metatype?: Constructor
}

export interface CallHandler<T = unknown> {
  handle: () => Promise<T>
}

export interface NestInterceptor {
  intercept: (context: ExecutionContext, next: CallHandler) => Promise<unknown>
}

export interface ExceptionFilter<T = Error> {
  catch: (exception: T, host: ArgumentsHost) => Promise<unknown> | unknown
}

export interface ExecutionContext {
  readonly container: DependencyContainer
  getClass: <T = Constructor>() => T
  getHandler: () => Function
  getContext: <T = Context>() => T
  switchToHttp: () => HttpArgumentsHost
}

export interface HttpArgumentsHost {
  getContext: <T = Context>() => T
}

export interface ArgumentsHost {
  switchToHttp: () => HttpArgumentsHost
  getContext: <T = Context>() => T
}

export interface GlobalEnhancerRegistry {
  guards: Array<Constructor<CanActivate>>
  pipes: Array<Constructor<PipeTransform>>
  interceptors: Array<Constructor<NestInterceptor>>
  filters: Array<Constructor<ExceptionFilter>>
}

export type RouteDefinition = {
  method: string
  path: string
  handlerName: string | symbol
}

export enum RouteParamtypes {
  CONTEXT = 'context',
  REQUEST = 'request',
  BODY = 'body',
  QUERY = 'query',
  PARAM = 'param',
  HEADERS = 'headers',
  CUSTOM = 'custom',
}

export interface RouteParamMetadataItem {
  index: number
  type: RouteParamtypes
  data?: string
  pipes?: Array<Constructor<PipeTransform>>
  factory?: (...args: unknown[]) => unknown
  metatype?: Constructor
}
