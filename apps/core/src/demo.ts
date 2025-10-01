import 'reflect-metadata'

import { createConfiguredApp } from './app.factory'

const baseUrl = 'http://localhost'

async function logResponse(label: string, response: Response) {
  const text = await response.text()
  let payload: unknown

  try {
    payload = JSON.parse(text)
  } catch {
    payload = text || null
  }

  console.info(`\n[${label}] => status ${response.status}`)
  console.info(payload)
}

function buildRequest(url: string | URL, init?: RequestInit) {
  return new Request(url, init)
}

async function runDemo() {
  const app = await createConfiguredApp()
  const hono = app.getInstance()

  const authorizedHeaders = {
    'x-api-key': process.env.API_KEY ?? 'secret-key',
  } satisfies Record<string, string>

  // 1. Successful GET with query pipe coverage
  const successRequest = buildRequest(`${baseUrl}/api/app?echo=demo`, {
    method: 'GET',
    headers: authorizedHeaders,
  })
  await logResponse('Successful GET /api/app', await hono.fetch(successRequest))

  // 2. Guard failure (missing API key)
  const guardFailureRequest = buildRequest(`${baseUrl}/api/app`)
  await logResponse('Guard failure', await hono.fetch(guardFailureRequest))

  // 3. Profile request exercising param + query parsing
  const profileRequest = buildRequest(
    `${baseUrl}/api/app/profiles/42?verbose=true`,
    {
      method: 'GET',
      headers: authorizedHeaders,
    },
  )
  await logResponse(
    'Profile GET /api/app/profiles/42',
    await hono.fetch(profileRequest),
  )

  // 4. Invalid JSON payload to trigger validation + exception filter
  const invalidBodyRequest = buildRequest(`${baseUrl}/api/app/messages/1`, {
    method: 'POST',
    headers: {
      ...authorizedHeaders,
      'content-type': 'application/json',
    },
    body: '{ invalid json',
  })
  await logResponse(
    'Invalid payload POST /api/app/messages/1',
    await hono.fetch(invalidBodyRequest),
  )

  // 5. Valid POST to test body parsing, pipes, and headers decorator
  const validBodyRequest = buildRequest(`${baseUrl}/api/app/messages/2`, {
    method: 'POST',
    headers: {
      ...authorizedHeaders,
      'content-type': 'application/json',
      'x-request-id': 'demo-request-id',
    },
    body: JSON.stringify({
      message: 'Hello from demo runner',
      tags: ['demo', 'framework'],
    }),
  })
  await logResponse(
    'Valid payload POST /api/app/messages/2',
    await hono.fetch(validBodyRequest),
  )

  // 6. Trigger unhandled error to validate global exception filter
  const errorRequest = buildRequest(`${baseUrl}/api/app/error`, {
    method: 'GET',
    headers: authorizedHeaders,
  })
  await logResponse(
    'Unhandled error GET /api/app/error',
    await hono.fetch(errorRequest),
  )
}

runDemo().catch((error) => {
  console.error('Demo execution failed', error)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
})
