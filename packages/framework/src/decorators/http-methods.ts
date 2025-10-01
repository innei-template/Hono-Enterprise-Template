import 'reflect-metadata'

import { ROUTES_METADATA } from '../constants'
import type { Constructor, RouteDefinition } from '../interfaces'

function attachRoute(target: Constructor, route: RouteDefinition) {
  const routes: RouteDefinition[] = Reflect.getMetadata(ROUTES_METADATA, target) || []
  Reflect.defineMetadata(ROUTES_METADATA, [...routes, route], target)
}

function createRouteDecorator(method: string) {
  return (path = ''): MethodDecorator =>
    (target, propertyKey) => {
      const controller = target.constructor as Constructor
      attachRoute(controller, {
        method,
        path,
        handlerName: propertyKey,
      })
    }
}

export const Get = createRouteDecorator('GET')
export const Post = createRouteDecorator('POST')
export const Put = createRouteDecorator('PUT')
export const Patch = createRouteDecorator('PATCH')
export const Delete = createRouteDecorator('DELETE')
export const Options = createRouteDecorator('OPTIONS')
export const Head = createRouteDecorator('HEAD')

export function getRoutesMetadata(target: Constructor): RouteDefinition[] {
  return (Reflect.getMetadata(ROUTES_METADATA, target) || []) as RouteDefinition[]
}
