import 'reflect-metadata'

import { injectable } from 'tsyringe'
import type { ZodError, ZodTypeAny } from 'zod'
import { z } from 'zod'

import { HttpException } from '../http-exception'
import type { ArgumentMetadata, Constructor, PipeTransform } from '../interfaces'

const ZOD_SCHEMA_METADATA = Symbol.for('hono.framework.zod-schema')

// eslint-disable-next-line unicorn/prefer-set-has
const PRIMITIVE_METATYPES: Constructor[] = [String, Boolean, Number, Array, Object, Date]

export interface ZodValidationPipeOptions {
  /** Convert validated payloads to class instances */
  transform?: boolean
  /** Strip properties not defined in the schema */
  whitelist?: boolean
  /** HTTP status returned when validation fails */
  errorHttpStatusCode?: number
  /** Reject primitive/empty values for object payloads */
  forbidUnknownValues?: boolean
  /** Include extra diagnostic info in validation errors */
  enableDebugMessages?: boolean
  /** Return only the first validation error */
  stopAtFirstError?: boolean
}

const DEFAULT_OPTIONS: Required<ZodValidationPipeOptions> = {
  transform: true,
  whitelist: true,
  errorHttpStatusCode: 400,
  forbidUnknownValues: true,
  enableDebugMessages: false,
  stopAtFirstError: false,
}

function isConstructor(value: unknown): value is Constructor {
  return typeof value === 'function'
}

function isPrimitive(metatype?: Constructor): boolean {
  if (!metatype) {
    return true
  }

  return PRIMITIVE_METATYPES.includes(metatype)
}

export function registerZodSchema(target: Constructor, schema: ZodTypeAny): void {
  Reflect.defineMetadata(ZOD_SCHEMA_METADATA, schema, target)
  Object.defineProperty(target, 'schema', {
    value: schema,
    enumerable: false,
    configurable: false,
    writable: false,
  })
}

export function getZodSchema(target?: Constructor): ZodTypeAny | undefined {
  if (!target || !isConstructor(target)) {
    return undefined
  }

  return (
    (Reflect.getMetadata(ZOD_SCHEMA_METADATA, target) as ZodTypeAny | undefined) ??
    (target as unknown as { schema?: ZodTypeAny }).schema
  )
}

export function ZodSchema(schema: ZodTypeAny): ClassDecorator {
  return (target) => {
    if (isConstructor(target)) {
      registerZodSchema(target, schema)
    }
  }
}

interface BuildZodSchemaDtoOptions {
  name?: string
}

function buildZodSchemaDto<TSchema extends ZodTypeAny>(
  schema: TSchema,
  options: BuildZodSchemaDtoOptions,
): Constructor<z.infer<TSchema>> {
  @ZodSchema(schema)
  class ZodSchemaDto {
    constructor(initial?: z.infer<TSchema>) {
      if (initial && typeof initial === 'object') {
        Object.assign(this, initial)
      }
    }
  }

  const desiredName = options.name ?? (schema.description ? `${schema.description}Dto` : 'AnonymousZodDto')

  Object.defineProperty(ZodSchemaDto, 'name', {
    value: desiredName,
    configurable: true,
  })

  return ZodSchemaDto as unknown as Constructor<z.infer<TSchema>>
}

export interface CreateZodSchemaDtoOptions {
  /** Override the generated class name */
  name?: string
}

export function createZodSchemaDto<TSchema extends ZodTypeAny>(
  schema: TSchema,
  options: CreateZodSchemaDtoOptions = {},
): Constructor<z.infer<TSchema>> {
  return buildZodSchemaDto(schema, options)
}

export function createZodDto<TSchema extends ZodTypeAny>(schema: TSchema): Constructor<z.infer<TSchema>> {
  return buildZodSchemaDto(schema, {})
}

@injectable()
export class ZodValidationPipe implements PipeTransform<unknown> {
  private readonly options: Required<ZodValidationPipeOptions>

  constructor(options: ZodValidationPipeOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!this.shouldValidate(metadata)) {
      return value
    }

    if (this.shouldRejectPrimitive(metadata, value)) {
      throw this.createException('Payload must be a JSON object', metadata)
    }

    const schema = getZodSchema(metadata.metatype)

    if (!schema) {
      return this.applyTransform(metadata, value)
    }

    const effectiveSchema = this.options.whitelist ? schema : this.relaxSchema(schema)

    const parsed = effectiveSchema.safeParse(value)

    if (!parsed.success) {
      throw this.createValidationException(parsed.error, metadata)
    }

    return this.applyTransform(metadata, parsed.data)
  }

  private shouldValidate(metadata: ArgumentMetadata): boolean {
    return (
      metadata.type === 'body' || metadata.type === 'query' || metadata.type === 'param' || metadata.type === 'headers'
    )
  }

  private shouldRejectPrimitive(metadata: ArgumentMetadata, value: unknown): boolean {
    if (!this.options.forbidUnknownValues) {
      return false
    }

    if (metadata.type !== 'body') {
      return false
    }

    return value === null || typeof value !== 'object' || Array.isArray(value)
  }

  private relaxSchema(schema: ZodTypeAny): ZodTypeAny {
    if (schema instanceof z.ZodObject) {
      return schema.passthrough()
    }

    return schema
  }

  private applyTransform(metadata: ArgumentMetadata, value: unknown): unknown {
    if (!this.options.transform) {
      return value
    }

    const { metatype: Metatype } = metadata

    if (isPrimitive(Metatype)) {
      return value
    }

    if (value === null || typeof value !== 'object') {
      return value
    }

    return Object.assign(new Metatype!(), value)
  }

  private createValidationException(error: ZodError, metadata: ArgumentMetadata): HttpException {
    const statusCode = this.options.errorHttpStatusCode
    const issues = this.options.stopAtFirstError ? error.issues.slice(0, 1) : error.issues

    const errors: Record<string, string[]> = {}

    for (const issue of issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
      const bucket = errors[path] ?? []
      bucket.push(issue.message)
      errors[path] = bucket
    }

    const response: Record<string, unknown> = {
      statusCode,
      message: 'Validation failed',
      errors,
    }

    /* c8 ignore next 3 */
    if (this.options.enableDebugMessages) {
      response.meta = {
        target: metadata.metatype?.name ?? 'Unknown',
        paramType: metadata.type,
      }
    }

    return new HttpException(response, statusCode)
  }

  private createException(message: string, metadata: ArgumentMetadata): HttpException {
    const statusCode = this.options.errorHttpStatusCode
    const response: Record<string, unknown> = {
      statusCode,
      message,
    }

    /* c8 ignore next 3 */
    if (this.options.enableDebugMessages) {
      response.meta = {
        target: metadata.metatype?.name ?? 'Unknown',
        paramType: metadata.type,
      }
    }

    return new HttpException(response, statusCode)
  }
}

export function createZodValidationPipe(options: ZodValidationPipeOptions = {}): Constructor<PipeTransform> {
  @injectable()
  class ConfiguredZodValidationPipe extends ZodValidationPipe {
    constructor() {
      super(options)
    }
  }

  Object.defineProperty(ConfiguredZodValidationPipe, 'name', {
    value: `ZodValidationPipe_${options.transform === false ? 'Passive' : 'Active'}`,
  })

  return ConfiguredZodValidationPipe
}
