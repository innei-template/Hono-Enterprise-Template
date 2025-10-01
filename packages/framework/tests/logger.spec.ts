import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLogger } from '../src'

describe('PrettyLogger', () => {
  const fixedDate = new Date('2025-01-01T00:00:00.000Z')

  const baseWriter = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  let originalCI: string | undefined

  beforeEach(() => {
    originalCI = process.env.CI
    delete process.env.CI
    Object.values(baseWriter).forEach((mock) => mock.mockReset())
  })

  afterEach(() => {
    if (originalCI === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCI
    }
  })

  it('formats messages with namespace and preserves arguments', () => {
    const logger = createLogger('Test', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })

    logger.info('hello', { foo: 'bar' })

    expect(baseWriter.info).toHaveBeenCalledTimes(1)
    expect(baseWriter.info.mock.calls[0][0]).toBe(
      '2025-01-01T00:00:00.000Z [i] [Test]',
    )
    expect(baseWriter.info.mock.calls[0][1]).toBe('hello')
    expect(baseWriter.info.mock.calls[0][2]).toEqual({ foo: 'bar' })
  })

  it('invokes base log level handler', () => {
    const logger = createLogger('Test', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })

    logger.log('general message')

    expect(baseWriter.log).toHaveBeenCalledTimes(1)
    expect(baseWriter.log.mock.calls[0][0]).toBe(
      '2025-01-01T00:00:00.000Z [•] [Test]',
    )
    expect(baseWriter.log.mock.calls[0][1]).toBe('general message')
  })

  it('supports extending namespaces', () => {
    const logger = createLogger('Parent', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })
    const child = logger.extend('Child')

    child.warn('issue detected')

    expect(baseWriter.warn).toHaveBeenCalledTimes(1)
    expect(baseWriter.warn.mock.calls[0][0]).toBe(
      '2025-01-01T00:00:00.000Z [!] [Parent:Child]',
    )
    expect(baseWriter.warn.mock.calls[0][1]).toBe('issue detected')
  })

  it('extends root logger without namespace', () => {
    const logger = createLogger(undefined, {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })
    const child = logger.extend('child')

    child.info('hello')

    expect(baseWriter.info).toHaveBeenCalledTimes(1)
    expect(baseWriter.info.mock.calls[0][0]).toBe(
      '2025-01-01T00:00:00.000Z [i] [child]',
    )
    expect(baseWriter.info.mock.calls[0][1]).toBe('hello')
  })

  it('falls back to log when specific level is unavailable', () => {
    const customWriter = { log: vi.fn() }
    const logger = createLogger(undefined, {
      writer: customWriter,
      clock: () => fixedDate,
      colors: false,
    })

    logger.debug('fine-grained message')

    expect(customWriter.log).toHaveBeenCalledTimes(1)
    expect(customWriter.log.mock.calls[0][0]).toBe(
      '2025-01-01T00:00:00.000Z [?]',
    )
    expect(customWriter.log.mock.calls[0][1]).toBe('fine-grained message')
  })

  it('applies custom color palette when enabled', () => {
    const logger = createLogger('Colorful', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: true,
      levelColors: {
        error: (value) => `error(${value})`,
      },
      namespaceColor: (value) => `ns(${value})`,
      timestampColor: (value) => `ts(${value})`,
    })

    logger.error('boom')

    expect(baseWriter.error).toHaveBeenCalledTimes(1)
    const [prefix, message] = baseWriter.error.mock.calls[0]
    expect(prefix).toContain('ts(')
    expect(prefix).toContain('error(')
    expect(prefix).toContain('ns(')
    expect(message).toBe('boom')
  })

  it('falls back to console when writer lacks level handlers', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const logger = createLogger(undefined, {
        writer: {},
        clock: () => fixedDate,
        colors: false,
      })

      logger.warn('fallback message')

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const [prefix, message] = consoleSpy.mock.calls[0]
      expect(prefix).toContain('[!]')
      expect(message).toBe('fallback message')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('returns text labels when running in CI', () => {
    process.env.CI = 'true'
    const logger = createLogger('CI', {
      writer: baseWriter,
      clock: () => fixedDate,
      colors: false,
    })

    logger.error('failure')

    expect(baseWriter.error).toHaveBeenCalledTimes(1)
    expect(baseWriter.error.mock.calls[0][0]).toBe(
      '2025-01-01T00:00:00.000Z [ERROR] [CI]',
    )
  })
})
