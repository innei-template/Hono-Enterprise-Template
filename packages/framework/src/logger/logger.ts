import pc from 'picocolors'

type ConsoleMethod = (...args: unknown[]) => void
type Colorizer = (value: string) => string

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export type LoggerWriter = Partial<Record<LogLevel, ConsoleMethod>> & {
  log?: ConsoleMethod
}

export interface LoggerOptions {
  writer?: LoggerWriter
  clock?: () => Date
  colors?: boolean
  levelColors?: Partial<Record<LogLevel, Colorizer>>
  namespaceColor?: Colorizer
  timestampColor?: Colorizer
  forceTextLabels?: boolean
}

const levelTextLabels: Record<LogLevel, string> = {
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
}

const levelSymbols: Record<LogLevel, string> = {
  log: '•',
  info: 'i',
  warn: '!',
  error: 'x',
  debug: '?',
}

const defaultLevelColors: Record<LogLevel, Colorizer> = {
  log: pc.white,
  info: pc.green,
  warn: pc.yellow,
  error: pc.red,
  debug: pc.cyan,
}

const identity = (value: string): string => value

const defaultClock = (): Date => new Date()

export class PrettyLogger {
  private readonly writer: LoggerWriter
  private readonly clock: () => Date
  private readonly colorsEnabled: boolean
  private readonly levelColors: Record<LogLevel, Colorizer>
  private readonly namespaceColor: Colorizer
  private readonly timestampColor: Colorizer
  private readonly useTextLabels: boolean

  constructor(
    private readonly namespace?: string,
    options: LoggerOptions = {},
  ) {
    this.writer = options.writer ?? console
    this.clock = options.clock ?? defaultClock
    this.colorsEnabled = options.colors ?? pc.isColorSupported
    this.levelColors = {
      log: options.levelColors?.log ?? defaultLevelColors.log,
      info: options.levelColors?.info ?? defaultLevelColors.info,
      warn: options.levelColors?.warn ?? defaultLevelColors.warn,
      error: options.levelColors?.error ?? defaultLevelColors.error,
      debug: options.levelColors?.debug ?? defaultLevelColors.debug,
    }
    this.namespaceColor = options.namespaceColor ?? pc.blue
    this.timestampColor = options.timestampColor ?? pc.dim
    this.useTextLabels = options.forceTextLabels ?? Boolean(process.env.CI)
  }

  log(...args: unknown[]): void {
    this.write('log', args)
  }

  info(...args: unknown[]): void {
    this.write('info', args)
  }

  warn(...args: unknown[]): void {
    this.write('warn', args)
  }

  error(...args: unknown[]): void {
    this.write('error', args)
  }

  debug(...args: unknown[]): void {
    this.write('debug', args)
  }

  extend(childNamespace: string): PrettyLogger {
    const combined = this.namespace ? `${this.namespace}:${childNamespace}` : childNamespace
    return new PrettyLogger(combined, {
      writer: this.writer,
      clock: this.clock,
      colors: this.colorsEnabled,
      levelColors: this.levelColors,
      namespaceColor: this.namespaceColor,
      timestampColor: this.timestampColor,
      forceTextLabels: this.useTextLabels,
    })
  }

  private write(level: LogLevel, args: unknown[]): void {
    const method = this.resolveWriter(level)
    const timestamp = this.clock().toISOString()

    const formatLevel = this.colorsEnabled ? this.levelColors[level] : identity
    const formatTimestamp = this.colorsEnabled ? this.timestampColor : identity
    const formatNamespace = this.colorsEnabled ? this.namespaceColor : identity

    const labelValue = this.useTextLabels ? levelTextLabels[level].padEnd(5, ' ') : levelSymbols[level]
    const segments = [
      formatTimestamp(timestamp),
      `[${formatLevel(labelValue)}]`,
      this.namespace ? `[${formatNamespace(this.namespace)}]` : undefined,
    ].filter(Boolean)

    method.call(this.writer, segments.join(' '), ...args)
  }

  private resolveWriter(level: LogLevel): ConsoleMethod {
    const candidate = this.writer[level]
    if (typeof candidate === 'function') {
      return candidate
    }

    if (typeof this.writer.log === 'function') {
      return this.writer.log
    }

    // eslint-disable-next-line no-console
    return console.log
  }
}

export function createLogger(namespace?: string, options?: LoggerOptions): PrettyLogger {
  return new PrettyLogger(namespace, options)
}
