import { injectable } from 'tsyringe'
import type { ZodTypeAny } from 'zod'

import { BadRequestException } from '../http-exception'
import type { ArgumentMetadata, PipeTransform } from '../interfaces'

export interface ZodValidationErrorResponse {
  message: string
  errors: Record<string, string[]>
}

export function createZodValidationPipe<TOutput>(schema: ZodTypeAny) {
  @injectable()
  class ZodValidationPipe implements PipeTransform<unknown, TOutput> {
    transform(value: unknown, metadata: ArgumentMetadata): TOutput {
      const parsed = schema.safeParse(value)
      if (parsed.success) {
        return parsed.data as TOutput
      }

      const formatted = parsed.error.format()
      const errors: Record<string, string[]> = {}

      for (const key of Object.keys(formatted)) {
        const issue = formatted[key]
        if (issue && '_errors' in issue && Array.isArray(issue._errors)) {
          errors[key] = issue._errors
        }
      }

      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        details: {
          type: metadata.type,
          errors,
        },
      })
    }
  }

  Object.defineProperty(ZodValidationPipe, 'name', {
    value: `ZodValidationPipe_${schema.description ?? 'Anonymous'}`,
  })

  return ZodValidationPipe
}
