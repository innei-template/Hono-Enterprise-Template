import { z } from 'zod'

export const createMessageSchema = z
  .object({
    message: z.string({ required_error: 'Message is required' }).min(1, 'Message is required'),
    tags: z.array(z.string().min(1)).max(10).optional(),
  })
  .describe('CreateMessage')

export type CreateMessageInput = z.infer<typeof createMessageSchema>
