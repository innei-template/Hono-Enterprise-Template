import 'reflect-metadata'

import { API_OPERATION_METADATA, API_TAGS_METADATA } from '../constants'
import type { Constructor } from '../interfaces'

export interface ApiOperationOptions {
  summary?: string
  description?: string
  operationId?: string
  deprecated?: boolean
  externalDocs?: {
    description?: string
    url: string
  }
  tags?: string[]
}

function getStore(target: object, key: symbol, propertyKey?: string | symbol): any {
  if (propertyKey) {
    return Reflect.getMetadata(key, target, propertyKey) as unknown
  }
  return Reflect.getMetadata(key, target) as unknown
}

function setStore(target: object, key: symbol, value: unknown, propertyKey?: string | symbol): void {
  if (propertyKey) {
    Reflect.defineMetadata(key, value, target, propertyKey)
  } else {
    Reflect.defineMetadata(key, value, target)
  }
}

export function ApiTags(...tags: string[]): ClassDecorator & MethodDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    const existing = (
      propertyKey
        ? getStore(target, API_TAGS_METADATA, propertyKey)
        : getStore(target.prototype ?? target, API_TAGS_METADATA)
    ) as string[] | undefined
    const next = Array.from(new Set([...(existing ?? []), ...tags.filter(Boolean)]))
    if (propertyKey) {
      setStore(target, API_TAGS_METADATA, next, propertyKey)
    } else {
      setStore(target.prototype ?? target, API_TAGS_METADATA, next)
    }
  }
}

export function ApiDoc(options: ApiOperationOptions): ClassDecorator & MethodDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      const existing = (getStore(target, API_OPERATION_METADATA, propertyKey) || {}) as ApiOperationOptions
      setStore(target, API_OPERATION_METADATA, { ...existing, ...options }, propertyKey)
    } else {
      const proto = target.prototype ?? target
      const existing = (getStore(proto, API_OPERATION_METADATA) || {}) as ApiOperationOptions
      setStore(proto, API_OPERATION_METADATA, { ...existing, ...options })
    }
  }
}

export function getApiTags(target: Constructor): string[]
export function getApiTags(target: object, propertyKey: string | symbol): string[]
export function getApiTags(target: object, propertyKey?: string | symbol): string[] {
  const store = propertyKey
    ? (getStore(target, API_TAGS_METADATA, propertyKey) as string[] | undefined)
    : (getStore((target as Constructor).prototype ?? target, API_TAGS_METADATA) as string[] | undefined)
  return store ? [...store] : []
}

export function getApiDoc(target: Constructor): ApiOperationOptions
export function getApiDoc(target: object, propertyKey: string | symbol): ApiOperationOptions
export function getApiDoc(target: object, propertyKey?: string | symbol): ApiOperationOptions {
  const store = propertyKey
    ? (getStore(target, API_OPERATION_METADATA, propertyKey) as ApiOperationOptions | undefined)
    : (getStore((target as Constructor).prototype ?? target, API_OPERATION_METADATA) as ApiOperationOptions | undefined)
  return store ? { ...store } : {}
}
