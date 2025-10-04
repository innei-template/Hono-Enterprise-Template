import type { TaskQueue } from './task-queue'
import type { TaskHandlerOptions } from './types'

type Constructor<T = object> = abstract new (...args: any[]) => T

type OptionsFactory = (instance: any) => TaskHandlerOptions | undefined

interface TaskProcessorMetadata {
  propertyKey: string | symbol
  handlerName: string
  queueProperty: string | symbol
  optionsFactory?: OptionsFactory
}

export interface TaskProcessorConfig<TInstance = any> {
  name: string
  queueProperty?: string | symbol
  options?: TaskHandlerOptions | ((instance: TInstance) => TaskHandlerOptions | undefined)
}

const DEFAULT_QUEUE_PROPERTY = 'queue'

const taskProcessorMetadata = new WeakMap<Constructor, TaskProcessorMetadata[]>()
const registeredHandlers = new WeakMap<TaskQueue, Set<string>>()
const WRAPPED_ON_MODULE_INIT = Symbol('task-processor:onModuleInitWrapped')

export function TaskProcessor(name: string, config?: Omit<TaskProcessorConfig, 'name'>): MethodDecorator
export function TaskProcessor(config: TaskProcessorConfig): MethodDecorator
export function TaskProcessor(
  nameOrConfig: string | TaskProcessorConfig,
  maybeConfig?: Omit<TaskProcessorConfig, 'name'>,
): MethodDecorator {
  const normalizedConfig = normalizeConfig(nameOrConfig, maybeConfig)
  const queueProperty = normalizedConfig.queueProperty ?? DEFAULT_QUEUE_PROPERTY
  const optionsFactory = createOptionsFactory(normalizedConfig.options)

  return (target, propertyKey, descriptor) => {
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new TypeError(`@TaskProcessor can only be applied to methods. "${String(propertyKey)}" is not callable.`)
    }

    ensureOnModuleInitHook(target)

    const constructor = target.constructor as Constructor
    const metadata: TaskProcessorMetadata = {
      propertyKey,
      handlerName: normalizedConfig.name,
      queueProperty,
      optionsFactory,
    }

    const existing = taskProcessorMetadata.get(constructor)
    if (existing) {
      existing.push(metadata)
    } else {
      taskProcessorMetadata.set(constructor, [metadata])
    }
  }
}

function normalizeConfig(
  nameOrConfig: string | TaskProcessorConfig,
  maybeConfig?: Omit<TaskProcessorConfig, 'name'>,
): TaskProcessorConfig {
  if (typeof nameOrConfig === 'string') {
    return {
      name: nameOrConfig,
      ...maybeConfig,
    }
  }

  if (!nameOrConfig || typeof nameOrConfig.name !== 'string' || nameOrConfig.name.length === 0) {
    throw new TypeError('@TaskProcessor requires a task name')
  }

  return nameOrConfig
}

function createOptionsFactory(options?: TaskProcessorConfig['options']): OptionsFactory | undefined {
  if (!options) {
    return undefined
  }

  if (typeof options === 'function') {
    return options as OptionsFactory
  }

  return () => options
}

function ensureOnModuleInitHook(target: any): void {
  if (target[WRAPPED_ON_MODULE_INIT]) {
    return
  }

  const original: (() => unknown | Promise<unknown>) | undefined = target.onModuleInit

  Object.defineProperty(target, 'onModuleInit', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: function onModuleInitWrapper(...args: unknown[]) {
      const invokeOriginal = async () => {
        if (typeof original === 'function') {
          const result = original.apply(this, args as any)
          if (result instanceof Promise) {
            await result
          }
        }
      }

      const finalize = () => {
        registerTaskHandlersForInstance(this)
      }

      const result = invokeOriginal()
      if (result instanceof Promise) {
        return result.then(finalize)
      }

      finalize()
      return result
    },
  })

  Object.defineProperty(target, WRAPPED_ON_MODULE_INIT, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
}

function registerTaskHandlersForInstance(instance: any): void {
  const constructor = instance.constructor as Constructor
  const metadata = taskProcessorMetadata.get(constructor)
  if (!metadata || metadata.length === 0) {
    return
  }

  for (const item of metadata) {
    const queue = resolveQueue(instance, item.queueProperty)

    const registered = getRegisteredHandlers(queue)
    if (registered.has(item.handlerName)) {
      continue
    }

    const handler = instance[item.propertyKey]
    if (typeof handler !== 'function') {
      throw new TypeError(
        `Task processor "${String(item.propertyKey)}" is not a function on ${constructor.name ?? 'AnonymousClass'}.`,
      )
    }

    const options = item.optionsFactory?.(instance)
    queue.registerHandler(item.handlerName, handler.bind(instance), options)
    registered.add(item.handlerName)
  }
}

function getRegisteredHandlers(queue: TaskQueue): Set<string> {
  let handlers = registeredHandlers.get(queue)
  if (!handlers) {
    handlers = new Set()
    registeredHandlers.set(queue, handlers)
  }
  return handlers
}

function resolveQueue(instance: any, propertyKey: string | symbol): TaskQueue {
  const queue = instance[propertyKey]
  if (!queue) {
    const className = instance.constructor?.name ?? 'AnonymousClass'
    throw new ReferenceError(
      `Task processor queue property "${String(propertyKey)}" is undefined on ${className}. ` +
        'Ensure the queue is created before onModuleInit completes.',
    )
  }

  return queue
}
