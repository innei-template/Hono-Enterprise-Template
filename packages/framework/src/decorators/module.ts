import 'reflect-metadata'

import { MODULE_METADATA } from '../constants'
import type { Constructor, ForwardReference, ModuleImport, ModuleMetadata } from '../interfaces'

function isForwardReference<T>(value: ModuleImport): value is ForwardReference<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'forwardRef' in value &&
    typeof (value as ForwardReference<T>).forwardRef === 'function'
  )
}

export function resolveModuleImport(target: ModuleImport): Constructor {
  if (isForwardReference(target)) {
    return target.forwardRef()
  }

  return target as Constructor
}

export function forwardRef<T = unknown>(factory: () => Constructor<T>): ForwardReference<T> {
  return {
    forwardRef: factory,
  }
}

export function Module(metadata: ModuleMetadata): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(MODULE_METADATA, metadata, target as unknown as Constructor)
  }
}

export function getModuleMetadata(target: Constructor): ModuleMetadata {
  return (Reflect.getMetadata(MODULE_METADATA, target) || {}) as ModuleMetadata
}

export function resolveModuleImports(imports: ModuleImport[] = []): Constructor[] {
  return imports.map((item) => resolveModuleImport(item))
}
