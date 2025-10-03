import { AsyncLocalStorage } from 'node:async_hooks'

import type { Context } from 'hono'

export interface HttpContextValues {
  hono: Context
}

interface HttpContextStore {
  values: HttpContextValues
}

const httpContextStorage = new AsyncLocalStorage<HttpContextStore>()

function ensureStore(): HttpContextStore {
  const store = httpContextStorage.getStore()
  if (!store) {
    throw new Error('HTTPContext is not available outside of request scope')
  }
  return store
}

export const HttpContext = {
  async run<T>(context: Context, fn: () => Promise<T> | T): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      httpContextStorage.run({ values: { hono: context } }, () => {
        Promise.resolve(fn()).then(resolve).catch(reject)
      })
    })
  },

  get<T = HttpContextValues>(): T {
    return ensureStore().values as unknown as T
  },

  getValue<TKey extends keyof HttpContextValues>(key: TKey): HttpContextValues[TKey] {
    return ensureStore().values[key]
  },

  setValue<TKey extends keyof HttpContextValues>(key: TKey, value: HttpContextValues[TKey]): void {
    ensureStore().values[key] = value
  },

  assign(values: Partial<HttpContextValues>): void {
    Object.assign(ensureStore().values, values)
  },

  setContext(context: Context): void {
    this.setValue('hono', context)
  },
}
