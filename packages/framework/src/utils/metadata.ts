import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, INTERCEPTORS_METADATA, PIPES_METADATA } from '../constants'
import { getEnhancerMetadata } from '../decorators/enhancers'
import type { CanActivate, Constructor, ExceptionFilter, Interceptor, PipeTransform } from '../interfaces'

function collectEnhancers<T>(
  metadataKey: symbol,
  controller: Constructor,
  propertyKey: string | symbol,
): Array<Constructor<T>> {
  const classLevel = getEnhancerMetadata<T>(metadataKey, controller)
  const methodLevel = getEnhancerMetadata<T>(metadataKey, controller.prototype, propertyKey)
  return [...classLevel, ...methodLevel]
}

export function collectGuards(controller: Constructor, propertyKey: string | symbol): Array<Constructor<CanActivate>> {
  return collectEnhancers(GUARDS_METADATA, controller, propertyKey)
}

export function collectPipes(controller: Constructor, propertyKey: string | symbol): Array<Constructor<PipeTransform>> {
  return collectEnhancers(PIPES_METADATA, controller, propertyKey)
}

export function collectInterceptors(
  controller: Constructor,
  propertyKey: string | symbol,
): Array<Constructor<Interceptor>> {
  return collectEnhancers(INTERCEPTORS_METADATA, controller, propertyKey)
}

export function collectFilters(
  controller: Constructor,
  propertyKey: string | symbol,
): Array<Constructor<ExceptionFilter>> {
  return collectEnhancers(EXCEPTION_FILTERS_METADATA, controller, propertyKey)
}
