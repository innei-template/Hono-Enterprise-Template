import { createZodSchemaDto } from '@hono-template/framework'
import { z } from 'zod'

export const enqueueNotificationSchema = z
  .object({
    recipient: z.string().email('Recipient must be a valid email address'),
    message: z.string().min(1, 'Message cannot be empty').max(1024, 'Message is too long'),
    channel: z.enum(['email', 'sms', 'push']).default('email'),
    delaySeconds: z.number().int().min(0).max(3600).optional(),
    attemptsBeforeSuccess: z.number().int().min(0).max(3).optional(),
    priority: z.number().int().min(0).max(10).optional(),
    metadata: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe('Additional metadata forwarded to the task handler'),
  })
  .describe('EnqueueNotification')

export class EnqueueNotificationDto extends createZodSchemaDto(enqueueNotificationSchema) {}

export type EnqueueNotificationInput = z.infer<typeof enqueueNotificationSchema>
