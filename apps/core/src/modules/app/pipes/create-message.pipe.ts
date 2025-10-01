import { createZodValidationPipe } from '@hono-template/framework'
import { createMessageSchema } from '../schemas/message.schema'

export const CreateMessagePipe = createZodValidationPipe(createMessageSchema)
