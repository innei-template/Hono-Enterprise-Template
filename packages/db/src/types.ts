import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { DBSchema } from './schema'

export type Drizzle = NodePgDatabase<DBSchema>

export type UUID = string & { readonly __brand: 'uuid' }

export type TimestampISO = string & { readonly __brand: 'iso_timestamp' }
