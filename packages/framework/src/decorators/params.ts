import 'reflect-metadata'

import { ROUTE_ARGS_METADATA } from '../constants'
import type {
  Constructor,
  PipeTransform,
  RouteParamMetadataItem,
} from '../interfaces'
import { RouteParamtypes } from '../interfaces'

type ParamDecoratorFactory = (
  data?: string,
  ...pipes: Array<Constructor<PipeTransform>>
) => ParameterDecorator

function appendMetadata(
  target: object,
  propertyKey: string | symbol,
  metadata: RouteParamMetadataItem,
) {
  const existing: RouteParamMetadataItem[] = (Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    target,
    propertyKey,
  ) || []) as RouteParamMetadataItem[]

  Reflect.defineMetadata(
    ROUTE_ARGS_METADATA,
    [...existing, metadata],
    target,
    propertyKey,
  )
}

function createParamDecorator(
  type: RouteParamtypes,
  factory?: (...args: unknown[]) => unknown,
): ParamDecoratorFactory {
  return (data?: string, ...pipes: Array<Constructor<PipeTransform>>) =>
    (target, propertyKey, parameterIndex) => {
      appendMetadata(target, propertyKey!, {
        index: parameterIndex,
        type,
        data,
        pipes,
        factory,
      })
    }
}

export const Body = createParamDecorator(RouteParamtypes.BODY)
export const Query = createParamDecorator(RouteParamtypes.QUERY)
export const Param = createParamDecorator(RouteParamtypes.PARAM)
export const Headers = createParamDecorator(RouteParamtypes.HEADERS)
export const Req = createParamDecorator(RouteParamtypes.REQUEST)
export const ContextParam = createParamDecorator(RouteParamtypes.CONTEXT)

export function getRouteArgsMetadata(
  target: object,
  propertyKey: string | symbol,
): RouteParamMetadataItem[] {
  const metadata: RouteParamMetadataItem[] = (Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    target,
    propertyKey,
  ) || []) as RouteParamMetadataItem[]

  const paramTypes: Constructor[] = (Reflect.getMetadata(
    'design:paramtypes',
    target,
    propertyKey,
  ) || []) as Constructor[]

  return metadata.map((item) => ({
    ...item,
    metatype: paramTypes[item.index],
  }))
}
