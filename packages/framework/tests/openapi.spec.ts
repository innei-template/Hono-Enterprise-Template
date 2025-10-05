/* eslint-disable unused-imports/no-unused-vars */
import 'reflect-metadata'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  ApiDoc,
  ApiTags,
  Body,
  Controller,
  createOpenApiDocument,
  createZodSchemaDto,
  Get,
  Headers,
  Module,
  Param,
  Post,
  Query,
  Req,
} from '../src'

const ListQueryDto = createZodSchemaDto(
  z
    .object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(10),
    })
    .describe('ListUsersQuery'),
  { name: 'ListUsersQueryDto' },
)

enum AccessLevel {
  LOW = 'low',
  HIGH = 'high',
}

const ComplexPayloadDto = createZodSchemaDto(
  z.object({
    email: z.string().email(),
    username: z.string().min(3),
    age: z.number().int().min(18).max(120),
    isActive: z.boolean(),
    tags: z.array(z.string().min(1)),
    status: z.union([z.literal('pending'), z.literal('completed')]),
    level: z.nativeEnum(AccessLevel),
    metadata: z.record(z.string(), z.unknown()),
    profile: z
      .object({
        displayName: z.string().min(1),
        bio: z.string().max(160).optional(),
      })
      .default({ displayName: 'anonymous' }),
    note: z.string().nullable().optional(),
    secret: z.string().transform((value) => value.trim()),
  }),
  { name: 'ComplexPayloadDto' },
)

const StatusControllerA = (() => {
  @ApiTags('Status')
  @Controller('status/a')
  class StatusController {
    @Get('/')
    health() {
      return 'ok'
    }
  }
  return StatusController
})()

const StatusControllerB = (() => {
  @ApiTags('Status')
  @Controller('status/b')
  class StatusController {
    @Get('/')
    health() {
      return 'ok'
    }
  }
  return StatusController
})()

@ApiTags('Users')
@Controller('users')
class UserController {
  @ApiDoc({ summary: 'List users', tags: ['Listing'] })
  @Get('/')
  list(@Query() query: InstanceType<typeof ListQueryDto>, @Query('tenant') tenantId: string, @Req() request: unknown) {
    void query
    void tenantId
    void request
    return []
  }

  @Get('/:id')
  getById(
    @Param('id') id: string,
    @Param() params: Record<string, string>,
    @Headers('x-debug') debug: boolean,
    @Headers('x-requested-at') requestedAt: Date,
  ) {
    void id
    void params
    void debug
    void requestedAt
    return {}
  }

  @ApiDoc({ summary: 'Create user', tags: ['Mutation'], deprecated: true })
  @Post('/')
  create(@Body() payload: InstanceType<typeof ComplexPayloadDto>) {
    void payload
    return { id: 'new' }
  }

  @Post('/bulk')
  bulkCreate(@Body() payload: InstanceType<typeof ComplexPayloadDto>) {
    void payload
    return { created: 1 }
  }
}

@Module({ controllers: [UserController] })
class UserModule {}

@Module({ controllers: [StatusControllerA, StatusControllerB] })
class StatusModule {}

@Module({ imports: [UserModule, StatusModule] })
class RootModule {}

describe('createOpenApiDocument', () => {
  it('generates OpenAPI grouped by module and controller with inferred schemas', () => {
    const document = createOpenApiDocument(RootModule, {
      title: 'Test API',
      version: '1.0.0',
      description: 'Generated for tests',
      globalPrefix: '/api',
      servers: [{ url: 'http://localhost:3000/api' }],
    })

    expect(document.openapi).toBe('3.1.0')
    expect(document.info.title).toBe('Test API')
    expect(document.servers?.[0]?.url).toBe('http://localhost:3000/api')

    const usersPath = document.paths['/api/users']
    expect(usersPath).toBeDefined()

    const listOperation = usersPath!.get
    expect(listOperation).toBeDefined()
    expect(listOperation?.summary).toBe('List users')
    expect(listOperation?.tags).toEqual(['User', 'User Controller', 'Users', 'Listing'])
    expect(listOperation?.parameters?.find((param) => param.name === 'tenant')).toMatchObject({
      in: 'query',
      schema: { type: 'string' },
    })
    expect(listOperation?.parameters?.find((param) => param.name === 'arg1')).toMatchObject({
      in: 'query',
      schema: { $ref: '#/components/schemas/ListUsersQueryDto' },
    })
    expect(listOperation?.parameters?.some((param) => param.in === 'path')).toBe(false)

    const detailOperation = document.paths['/api/users/{id}'].get
    expect(detailOperation?.tags).toEqual(['User', 'User Controller', 'Users'])
    expect(detailOperation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', in: 'path', required: true, schema: { type: 'string' } }),
        expect.objectContaining({ name: 'arg1', in: 'path', required: true }),
        expect.objectContaining({ name: 'x-debug', in: 'header', schema: { type: 'boolean' } }),
        expect.objectContaining({ name: 'x-requested-at', in: 'header', schema: { type: 'string' } }),
      ]),
    )

    const createOperation = document.paths['/api/users'].post
    expect(createOperation?.tags).toEqual(['User', 'User Controller', 'Users', 'Mutation'])
    expect(createOperation?.deprecated).toBe(true)
    expect(createOperation?.requestBody?.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ComplexPayloadDto',
    })

    expect(document.components?.schemas?.ComplexPayloadDto).toMatchObject({
      type: 'object',
      required: expect.arrayContaining([
        'email',
        'username',
        'age',
        'isActive',
        'tags',
        'status',
        'level',
        'metadata',
        'profile',
        'secret',
      ]),
    })

    const schema = document.components?.schemas?.ComplexPayloadDto as Record<string, any>
    expect(schema.properties.email.format).toBe('email')
    expect(schema.properties.age.minimum).toBe(18)
    expect(schema.properties.age.maximum).toBe(120)
    expect(schema.properties.tags.items).toEqual({ type: 'string', minLength: 1 })
    expect(schema.properties.status.oneOf).toBeDefined()
    expect(schema.properties.level.enum).toEqual(['low', 'high'])
    expect(schema.properties.metadata.additionalProperties).toEqual({ type: 'string' })
    expect(schema.properties.profile).toMatchObject({
      type: 'object',
      required: ['displayName'],
    })

    const tags = document.tags ?? []
    expect(tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining(['User', 'User Controller', 'Users', 'Listing', 'Status', 'Status Controller']),
    )

    const duplicateOperation = document.paths['/api/status/b'].get
    expect(duplicateOperation?.operationId.endsWith('_1')).toBe(true)

    const modulesTree = document['x-modules']
    expect(modulesTree).toBeDefined()
    const rootNode = modulesTree?.[0]
    expect(rootNode?.name).toBe('Root')
    const userModuleNode = rootNode?.children?.find((node) => node.name === 'User')
    expect(userModuleNode?.controllers?.[0]?.routes.length).toBeGreaterThan(0)
  })
})
