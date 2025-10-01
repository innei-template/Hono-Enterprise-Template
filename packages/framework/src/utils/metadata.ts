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
import { getEnhancerMetadata } from '../decorators/enhancers';

const collectEnhancers = <T>(
  metadataKey: symbol,
  controller: Constructor,
  propertyKey: string | symbol,
): Constructor<T>[] => {
  const classLevel = getEnhancerMetadata<T>(metadataKey, controller);
  const methodLevel = getEnhancerMetadata<T>(metadataKey, controller.prototype, propertyKey);
  return [...classLevel, ...methodLevel];
};

export const collectGuards = (
  controller: Constructor,
  propertyKey: string | symbol,
): Constructor<CanActivate>[] => collectEnhancers(GUARDS_METADATA, controller, propertyKey);

export const collectPipes = (
  controller: Constructor,
  propertyKey: string | symbol,
): Constructor<PipeTransform>[] => collectEnhancers(PIPES_METADATA, controller, propertyKey);

export const collectInterceptors = (
  controller: Constructor,
  propertyKey: string | symbol,
): Constructor<NestInterceptor>[] => collectEnhancers(INTERCEPTORS_METADATA, controller, propertyKey);

export const collectFilters = (
  controller: Constructor,
  propertyKey: string | symbol,
): Constructor<ExceptionFilter>[] => collectEnhancers(EXCEPTION_FILTERS_METADATA, controller, propertyKey);
