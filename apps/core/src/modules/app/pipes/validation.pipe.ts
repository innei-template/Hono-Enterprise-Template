import { injectable } from 'tsyringe'
import type { ArgumentMetadata, Constructor, PipeTransform } from '@hono-template/framework'
import { BadRequestException } from '@hono-template/framework'

const PRIMITIVE_METATYPES: Constructor[] = [String, Boolean, Number, Array, Object, Date];

const isPrimitive = (metatype?: Constructor): boolean => {
  if (!metatype) {
    return true;
  }

  return PRIMITIVE_METATYPES.includes(metatype);
};

@injectable()
export class ValidationPipe implements PipeTransform<unknown> {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (metadata.type !== 'body') {
      return value;
    }

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Payload must be a JSON object',
      });
    }

    const metatype = metadata.metatype;

    if (!metatype || isPrimitive(metatype)) {
      return value;
    }

    return Object.assign(new metatype(), value);
  }
}
