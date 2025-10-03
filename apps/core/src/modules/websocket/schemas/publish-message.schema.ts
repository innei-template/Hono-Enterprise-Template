import { createZodSchemaDto } from '@hono-template/framework'
import { z } from 'zod'

export const publishMessageSchema = z
  .object({
    payload: z.unknown().describe('Arbitrary payload broadcast to channel subscribers'),
  })
  .describe('PublishMessage')

export class PublishMessageDto extends createZodSchemaDto(publishMessageSchema) {}

export type PublishMessageInput = z.infer<typeof publishMessageSchema>
