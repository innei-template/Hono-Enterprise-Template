import type { ArgumentMetadata, PipeTransform } from '@hono-template/framework'
import { BadRequestException } from '@hono-template/framework'
import { injectable } from 'tsyringe'

@injectable()
export class ParseIntPipe implements PipeTransform<unknown, number> {
  transform(value: unknown, metadata: ArgumentMetadata): number {
    if (value === undefined || value === null || value === '') {
      throw new BadRequestException({
        statusCode: 400,
        message: `Missing required parameter ${metadata.data ?? ''}`.trim(),
      })
    }

    const parsedValue =
      typeof value === 'number' ? value : Number.parseInt(String(value), 10)

    if (Number.isNaN(parsedValue)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed (numeric string is expected)',
      })
    }

    return parsedValue
  }
}
