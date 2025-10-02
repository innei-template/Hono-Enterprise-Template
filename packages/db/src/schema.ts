import { pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { z } from 'zod'

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid').defaultRandom().notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('queued'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
})

export const insertMessageSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
})

export type InsertMessage = z.infer<typeof insertMessageSchema>

export const dbSchema = {
  messages,
}

export type DBSchema = typeof dbSchema
