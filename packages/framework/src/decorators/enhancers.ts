import 'reflect-metadata';
import {
  EXCEPTION_FILTERS_METADATA,
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  PIPES_METADATA,
} from '../constants';
import type {
  CanActivate,
  Constructor,
  ExceptionFilter,
  NestInterceptor,
  PipeTransform,
} from '../interfaces';

type DecoratorTarget = object;

type EnhancerDecorator<T> = ClassDecorator &
  MethodDecorator &
  ((target: DecoratorTarget, propertyKey?: string | symbol) => void);

const appendMetadata = <T>(
  metadataKey: symbol,
  values: T[],
  target: DecoratorTarget,
  propertyKey?: string | symbol,
) => {
  const existing: T[] = (
    propertyKey !== undefined
      ? (Reflect.getMetadata(metadataKey, target, propertyKey) || [])
      : (Reflect.getMetadata(metadataKey, target) || [])
  ) as T[];

  if (propertyKey !== undefined) {
    Reflect.defineMetadata(metadataKey, [...existing, ...values], target, propertyKey);
  } else {
    Reflect.defineMetadata(metadataKey, [...existing, ...values], target);
  }
};

const createEnhancerDecorator = <T>(metadataKey: symbol) =>
  (...items: T[]): EnhancerDecorator<T> =>
    (target: DecoratorTarget, propertyKey?: string | symbol) => {
      appendMetadata(
        metadataKey,
        items,
        propertyKey ? target : (target as Function),
        propertyKey,
      );
    };

export const UseGuards = createEnhancerDecorator<Constructor<CanActivate>>(GUARDS_METADATA);
export const UsePipes = createEnhancerDecorator<Constructor<PipeTransform>>(PIPES_METADATA);
export const UseInterceptors = createEnhancerDecorator<Constructor<NestInterceptor>>(INTERCEPTORS_METADATA);
export const UseFilters = createEnhancerDecorator<Constructor<ExceptionFilter>>(EXCEPTION_FILTERS_METADATA);

export const getEnhancerMetadata = <T>(
  metadataKey: symbol,
  target: DecoratorTarget,
  propertyKey?: string | symbol,
): Constructor<T>[] => {
  return (
    (propertyKey !== undefined
      ? Reflect.getMetadata(metadataKey, target, propertyKey)
      : Reflect.getMetadata(metadataKey, target)) || []
  ) as Constructor<T>[];
};
