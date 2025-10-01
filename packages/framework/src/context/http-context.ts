import { AsyncLocalStorage } from 'node:async_hooks'

import type { Context } from 'hono'

export interface HttpContextStore {
  context: Context
}

const httpContextStorage = new AsyncLocalStorage<HttpContextStore>()

export const HttpContext = {
  async run<T>(context: Context, fn: () => Promise<T> | T): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      httpContextStorage.run({ context }, () => {
        Promise.resolve(fn()).then(resolve).catch(reject)
      })
    })
  },

  get<T = Context>(): T {
    const store = httpContextStorage.getStore()
    if (!store) {
      throw new Error('HTTPContext is not available outside of request scope')
    }

    return store.context as unknown as T
  },

  setContext(context: Context): void {
    const store = httpContextStorage.getStore()
    if (!store) {
      throw new Error('Cannot set context outside of an active HTTPContext scope')
    }

    store.context = context
  },
}
