import type { HonoHttpApplication } from '@hono-template/framework'
import { beforeAll, describe, expect, it } from 'vitest'

import { createConfiguredApp as createAppFactory } from '../app.factory'

const BASE_URL = 'http://localhost'

function buildRequest (path: string, init?: RequestInit) {
  return new Request(`${BASE_URL}${path}`, init)
}

function authorizedHeaders() {
  return {
    'x-api-key': process.env.API_KEY ?? 'secret-key',
  }
}

describe('HonoHttpApplication integration', () => {
  let app: HonoHttpApplication
  let fetcher: (request: Request) => Promise<Response>

  beforeAll(async () => {
    app = await createAppFactory()
    fetcher = (request: Request) =>
      Promise.resolve(app.getInstance().fetch(request))
  })

  const json = async (response: Response) => ({
    status: response.status,
    data: await response.json(),
  })

  it('responds to root route without guard', async () => {
    const response = await fetcher(
      buildRequest('/api/app?echo=test-suite', {
        method: 'GET',
      }),
    )

    const body = await json(response)
    expect(body.status).toBe(200)
    expect(body.data).toMatchObject({
      message: 'Hello from HonoHttpApplication',
      echo: 'test-suite',
    })
  })

  it('enforces guards when API key missing', async () => {
    const response = await fetcher(buildRequest('/api/app/profiles/5'))

    const body = await json(response)
    expect(body.status).toBe(401)
    expect(body.data).toMatchObject({ message: 'Invalid API key' })
  })

  it('resolves params, query, and pipes when authorized', async () => {
    const response = await fetcher(
      buildRequest('/api/app/profiles/7?verbose=true', {
        headers: authorizedHeaders(),
      }),
    )

    const body = await json(response)
    expect(body.status).toBe(200)
    expect(body.data).toMatchObject({
      id: 7,
      username: 'user-7',
      role: 'member',
    })
    expect(body.data.verbose).toBeDefined()
  })

  it('returns validation error on malformed JSON payload', async () => {
    const response = await fetcher(
      buildRequest('/api/app/messages/1', {
        method: 'POST',
        headers: {
          ...authorizedHeaders(),
          'content-type': 'application/json',
        },
        body: '{ invalid json',
      }),
    )

    const body = await json(response)
    expect(body.status).toBe(400)
    expect(body.data).toMatchObject({ message: 'Invalid JSON payload' })
  })

  it('processes body payload with validation and pipes', async () => {
    const response = await fetcher(
      buildRequest('/api/app/messages/9', {
        method: 'POST',
        headers: {
          ...authorizedHeaders(),
          'content-type': 'application/json',
          'x-request-id': 'vitest-request',
        },
        body: JSON.stringify({
          message: 'unit test',
          tags: ['vitest'],
        }),
      }),
    )

    const body = await json(response)
    expect(body.status).toBe(200)
    expect(body.data).toMatchObject({
      requestId: 'vitest-request',
      data: {
        id: 9,
        message: 'unit test',
      },
    })
  })

  it('validates body with zod pipe and reports schema errors', async () => {
    const response = await fetcher(
      buildRequest('/api/app/messages/10', {
        method: 'POST',
        headers: {
          ...authorizedHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tags: [] }),
      }),
    )

    const body = await json(response)
    expect(body.status).toBe(400)
    expect(body.data).toMatchObject({
      message: 'Validation failed',
      details: {
        errors: {
          message: ['Message is required'],
        },
      },
    })
  })

  it('exposes HttpContext through async_hooks store', async () => {
    const response = await fetcher(
      buildRequest('/api/app/context-check', {
        method: 'GET',
        headers: authorizedHeaders(),
      }),
    )

    const body = await json(response)
    expect(body.status).toBe(200)
    expect(body.data).toMatchObject({
      same: true,
      path: '/api/app/context-check',
    })
  })

  it('delegates unhandled errors to the exception filter', async () => {
    const response = await fetcher(
      buildRequest('/api/app/error', {
        method: 'GET',
        headers: authorizedHeaders(),
      }),
    )

    const body = await json(response)
    expect(body.status).toBe(500)
    expect(body.data).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    })
  })
})
