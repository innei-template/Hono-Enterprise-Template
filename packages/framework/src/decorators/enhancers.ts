import 'reflect-metadata'

import {
  EXCEPTION_FILTERS_METADATA,
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  PIPES_METADATA,
} from '../constants'
import type {
  CanActivate,
  Constructor,
  ExceptionFilter,
  NestInterceptor,
  PipeTransform,
} from '../interfaces'

type DecoratorTarget = object

type EnhancerDecorator = ClassDecorator &
  MethodDecorator &
  ((target: DecoratorTarget, propertyKey?: string | symbol) => void)

function appendMetadata<T>(
  metadataKey: symbol,
  values: T[],
  target: DecoratorTarget,
  propertyKey?: string | symbol,
) {
  const existing: T[] = (
    propertyKey !== undefined
      ? Reflect.getMetadata(metadataKey, target, propertyKey) || []
      : Reflect.getMetadata(metadataKey, target) || []
  ) as T[]

  if (propertyKey !== undefined) {
    Reflect.defineMetadata(
      metadataKey,
      [...existing, ...values],
      target,
      propertyKey,
    )
  } else {
    Reflect.defineMetadata(metadataKey, [...existing, ...values], target)
  }
}

function createEnhancerDecorator<T>(metadataKey: symbol) {
  return (...items: T[]): EnhancerDecorator =>
    (target: DecoratorTarget, propertyKey?: string | symbol) => {
      appendMetadata(
        metadataKey,
        items,
        propertyKey ? target : (target as (...args: any[]) => any),
        propertyKey,
      )
    }
}

export const UseGuards =
  createEnhancerDecorator<Constructor<CanActivate>>(GUARDS_METADATA)
export const UsePipes =
  createEnhancerDecorator<Constructor<PipeTransform>>(PIPES_METADATA)
export const UseInterceptors = createEnhancerDecorator<
  Constructor<NestInterceptor>
>(INTERCEPTORS_METADATA)
export const UseFilters = createEnhancerDecorator<Constructor<ExceptionFilter>>(
  EXCEPTION_FILTERS_METADATA,
)

export function getEnhancerMetadata<T>(
  metadataKey: symbol,
  target: DecoratorTarget,
  propertyKey?: string | symbol,
): Array<Constructor<T>> {
  return ((propertyKey !== undefined
    ? Reflect.getMetadata(metadataKey, target, propertyKey)
    : Reflect.getMetadata(metadataKey, target)) || []) as Array<Constructor<T>>
}
