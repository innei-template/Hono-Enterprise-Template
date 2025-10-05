import type { ZodTypeAny } from 'zod'
import {
  ZodArray,
  ZodBoolean,
  ZodEnum,
  ZodLiteral,
  ZodNever,
  ZodNumber,
  ZodObject,
  ZodRecord,
  ZodString,
  ZodUnion,
} from 'zod'

import { getControllerMetadata } from '../decorators/controller'
import { getRoutesMetadata } from '../decorators/http-methods'
import { getModuleMetadata, resolveModuleImports } from '../decorators/module'
import { getApiDoc, getApiTags } from '../decorators/openapi'
import { getRouteArgsMetadata } from '../decorators/params'
import type { Constructor, RouteParamMetadataItem } from '../interfaces'
import { RouteParamtypes } from '../interfaces'
import { getZodSchema } from '../pipes/zod-validation.pipe'

export interface OpenApiOptions {
  title: string
  version: string
  description?: string
  servers?: OpenApiServer[]
  globalPrefix?: string
}

export interface OpenApiServer {
  url: string
  description?: string
}

export interface OpenApiDocument {
  openapi: '3.1.0'
  info: {
    title: string
    version: string
    description?: string
  }
  servers?: OpenApiServer[]
  tags?: OpenApiTag[]
  paths: Record<string, Record<string, OpenApiOperation>>
  components?: {
    schemas?: Record<string, unknown>
  }
  'x-modules'?: ModuleDocumentNode[]
}

export interface OpenApiTag {
  name: string
  description?: string
  'x-module'?: string
  'x-controller'?: string
  'x-module-path'?: string[]
}

export interface OpenApiOperation {
  summary?: string
  description?: string
  operationId: string
  tags?: string[]
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  responses: Record<string, OpenApiResponse>
  'x-module'?: string
  'x-controller'?: string
  'x-handler'?: string
  deprecated?: boolean
  externalDocs?: {
    description?: string
    url: string
  }
}

export interface OpenApiParameter {
  name: string
  in: 'query' | 'header' | 'path'
  required?: boolean
  schema: unknown
}

export interface OpenApiRequestBody {
  required?: boolean
  content: Record<string, { schema: unknown }>
}

export interface OpenApiResponse {
  description: string
  content?: Record<string, { schema: unknown }>
}

interface ModuleDocumentNode {
  name: string
  path: string[]
  controllers: ModuleControllerNode[]
  children: ModuleDocumentNode[]
}

interface ModuleControllerNode {
  name: string
  routes: ModuleRouteNode[]
}

interface ModuleRouteNode {
  method: string
  path: string
  operationId: string
  tags: string[]
}

interface SchemaConversionResult {
  schema: unknown
  optional: boolean
}

const DEFAULT_SUCCESS_RESPONSE: OpenApiResponse = {
  description: 'Successful response',
}

const OPTIONAL_WRAPPER_TYPES = new Set(['ZodOptional', 'ZodDefault', 'ZodCatch'])
const NULLABLE_WRAPPER_TYPES = new Set(['ZodNullable'])
const PASSTHROUGH_WRAPPER_TYPES = new Set([
  'ZodEffects',
  'ZodPipeline',
  'ZodTransform',
  'ZodReadonly',
  'ZodBranded',
  'ZodBrand',
  'ZodCoerce',
])

interface ModuleNode {
  module: Constructor
  label: string
  controllers: Constructor[]
  children: ModuleNode[]
}

export function createOpenApiDocument(rootModule: Constructor, options: OpenApiOptions): OpenApiDocument {
  const { root: rootModuleNode, controllerPaths } = buildModuleGraph(rootModule)
  const schemas = new Map<Constructor, unknown>()

  const tags = new Map<string, OpenApiTag>()
  const paths: Record<string, Record<string, OpenApiOperation>> = {}
  const operationIds = new Map<string, number>()

  const moduleRoutes = new Map<string, Map<string, ModuleControllerNode>>()

  for (const [controller, modulePath] of controllerPaths.entries()) {
    const routes = getRoutesMetadata(controller)
    const controllerMetadata = getControllerMetadata(controller)

    const moduleKey = getModuleKeyFromPath(modulePath)
    const moduleDisplayName = modulePath.length > 0 ? modulePath.at(-1)!.label : 'Application'
    ensureModuleTag(tags, moduleKey, modulePath, moduleDisplayName)

    const controllerKey = getControllerKey(controller)
    const controllerDisplayName = formatControllerDisplayName(controller)
    ensureControllerTag(tags, controllerKey, modulePath, controller, controllerDisplayName)

    const classTags = getApiTags(controller)
    classTags.forEach((tag) => ensureGenericTag(tags, tag))

    const classDoc = getApiDoc(controller)

    for (const route of routes) {
      const fullPath = normalizePath(options.globalPrefix, controllerMetadata.prefix, route.path)
      const openApiPath = convertHonoPathToOpenApi(fullPath)
      const method = route.method.toLowerCase()

      const operationIdBase = `${controller.name || 'AnonymousController'}_${String(route.handlerName)}`
      const operationId = resolveOperationId(operationIdBase, operationIds)

      const parameterMetadata = getRouteArgsMetadata(controller.prototype, route.handlerName)
      const sortedMetadata = [...parameterMetadata].sort((a, b) => a.index - b.index)

      const parameters: OpenApiParameter[] = []
      let requestBody: OpenApiRequestBody | undefined

      for (const metadata of sortedMetadata) {
        if (!metadata) {
          continue
        }

        if (metadata.type === RouteParamtypes.BODY) {
          requestBody = buildRequestBody(metadata, schemas)
          continue
        }

        const parameter = buildParameter(metadata, route.path, schemas)
        if (parameter) {
          parameters.push(parameter)
        }
      }

      const methodTags = getApiTags(controller.prototype, route.handlerName)
      methodTags.forEach((tag) => ensureGenericTag(tags, tag))

      const methodDoc = getApiDoc(controller.prototype, route.handlerName)
      const docTags = [...(classDoc.tags ?? []), ...(methodDoc.tags ?? [])]
      docTags.forEach((tag) => ensureGenericTag(tags, tag))

      const customTags = dedupeTags([...classTags, ...methodTags, ...docTags])
      const combinedTags = customTags.length > 0 ? customTags : [moduleDisplayName]

      const effectiveOperationId = methodDoc.operationId ?? classDoc.operationId ?? operationId

      const responses: Record<string, OpenApiResponse> = { '200': DEFAULT_SUCCESS_RESPONSE }

      if (!paths[openApiPath]) {
        paths[openApiPath] = {}
      }

      const operation: OpenApiOperation = {
        summary: methodDoc.summary ?? classDoc.summary ?? String(route.handlerName),
        description: methodDoc.description ?? classDoc.description,
        operationId: effectiveOperationId,
        tags: combinedTags.length > 0 ? combinedTags : undefined,
        parameters: parameters.length > 0 ? parameters : undefined,
        requestBody,
        responses,
        'x-module': modulePath.at(-1)?.module.name || moduleDisplayName,
        'x-controller': controller.name || 'AnonymousController',
        'x-handler': String(route.handlerName),
      }

      const deprecated = methodDoc.deprecated ?? classDoc.deprecated
      if (deprecated !== undefined) {
        operation.deprecated = deprecated
      }

      const externalDocs = methodDoc.externalDocs ?? classDoc.externalDocs
      if (externalDocs) {
        operation.externalDocs = externalDocs
      }

      paths[openApiPath][method] = operation

      const controllersMap = getOrCreate(moduleRoutes, moduleKey, () => new Map<string, ModuleControllerNode>())
      const controllerEntry = getOrCreate(controllersMap, controllerKey, () => ({
        name: controllerDisplayName,
        routes: [],
      }))
      controllerEntry.routes.push({
        method: route.method.toUpperCase(),
        path: openApiPath,
        operationId: effectiveOperationId,
        tags: combinedTags,
      })
    }
  }

  const componentsSchemas = Object.fromEntries(
    [...schemas.entries()].map(([constructor, schema]) => [getSchemaName(constructor), schema]),
  )

  const modulesTree = [buildModuleDocumentTree(rootModuleNode, [], moduleRoutes)]

  return {
    openapi: '3.1.0',
    info: {
      title: options.title,
      version: options.version,
      description: options.description,
    },
    servers: options.servers,
    tags: [...tags.values()],
    paths,
    components: Object.keys(componentsSchemas).length > 0 ? { schemas: componentsSchemas } : undefined,
    'x-modules': modulesTree,
  }
}

function buildModuleGraph(rootModule: Constructor): {
  root: ModuleNode
  controllerPaths: Map<Constructor, ModuleNode[]>
} {
  const nodeMap = new Map<Constructor, ModuleNode>()
  const controllerPaths = new Map<Constructor, ModuleNode[]>()
  const visited = new Set<Constructor>()

  const createNode = (moduleClass: Constructor): ModuleNode => {
    const existing = nodeMap.get(moduleClass)
    if (existing) {
      return existing
    }

    const metadata = getModuleMetadata(moduleClass)
    const node: ModuleNode = {
      module: moduleClass,
      label: formatModuleLabel(moduleClass),
      controllers: metadata.controllers ?? [],
      children: [],
    }

    nodeMap.set(moduleClass, node)
    return node
  }

  const traverse = (moduleClass: Constructor, path: ModuleNode[]): ModuleNode => {
    const node = createNode(moduleClass)
    const metadata = getModuleMetadata(moduleClass)
    const currentPath = [...path, node]

    for (const controller of node.controllers) {
      if (!controllerPaths.has(controller as Constructor)) {
        controllerPaths.set(controller as Constructor, currentPath)
      }
    }

    if (visited.has(moduleClass)) {
      return node
    }

    visited.add(moduleClass)

    const imports = resolveModuleImports(metadata.imports ?? [])
    for (const imported of imports) {
      const childNode = traverse(imported, currentPath)
      if (!node.children.includes(childNode)) {
        node.children.push(childNode)
      }
    }

    return node
  }

  const root = traverse(rootModule, [])

  return { root, controllerPaths }
}

function ensureModuleTag(
  tags: Map<string, OpenApiTag>,
  key: string,
  modulePath: ModuleNode[],
  displayName: string,
): void {
  if (tags.has(key)) {
    return
  }

  const lastModule = modulePath.at(-1)?.module

  tags.set(key, {
    name: displayName,
    description: `${displayName} module routes`,
    'x-module': lastModule?.name || displayName,
    'x-module-path': modulePath.map((node) => node.module.name || node.label),
  })
}

function ensureControllerTag(
  tags: Map<string, OpenApiTag>,
  key: string,
  modulePath: ModuleNode[],
  controller: Constructor,
  displayName: string,
): void {
  if (tags.has(key)) {
    return
  }

  tags.set(key, {
    name: displayName,
    description: `${controller.name || 'AnonymousController'} controller routes`,
    'x-module': modulePath.at(-1)?.module.name || modulePath.at(-1)?.label || 'AnonymousModule',
    'x-controller': controller.name || 'AnonymousController',
  })
}

function ensureGenericTag(tags: Map<string, OpenApiTag>, name: string): void {
  if (tags.has(name)) {
    return
  }

  tags.set(name, {
    name,
  })
}

function formatModuleLabel(module: Constructor): string {
  const raw = module.name || 'AnonymousModule'
  if (raw.endsWith('Module')) {
    const trimmed = raw.slice(0, -6)
    return trimmed.length > 0 ? trimmed : raw
  }
  return raw
}

function formatControllerDisplayName(controller: Constructor): string {
  const raw = controller.name || 'AnonymousController'
  if (raw.endsWith('Controller')) {
    const trimmed = raw.slice(0, -10)
    if (trimmed.length > 0) {
      return trimmed
    }
  }
  return raw
}

function getControllerKey(controller: Constructor): string {
  return controller.name || 'AnonymousController'
}

function getModuleKeyFromPath(modulePath: ModuleNode[]): string {
  if (modulePath.length === 0) {
    return 'Application'
  }
  return modulePath.map((node) => node.label).join('::')
}

function resolveOperationId(base: string, counter: Map<string, number>): string {
  const previous = counter.get(base) ?? 0
  counter.set(base, previous + 1)

  if (previous === 0) {
    return sanitizeOperationId(base)
  }

  return sanitizeOperationId(`${base}_${previous}`)
}

function sanitizeOperationId(value: string): string {
  return value.replaceAll(/\W/g, '_')
}

function normalizePath(...segments: Array<string | undefined | null>): string {
  const filtered = segments
    .filter((segment): segment is string => Boolean(segment && segment.trim().length > 0))
    .map((segment) => segment.trim())
    .map((segment) => segment.replaceAll(/^\/+|\/+$|\s+/g, ''))
    .filter((segment) => segment.length > 0)

  if (filtered.length === 0) {
    return '/'
  }

  return `/${filtered.join('/')}`.replaceAll(/\/+/g, '/')
}

function convertHonoPathToOpenApi(path: string): string {
  return path.replaceAll(/:(\w+)/g, '{$1}')
}

function buildParameter(
  metadata: RouteParamMetadataItem,
  routePath: string,
  schemas: Map<Constructor, unknown>,
): OpenApiParameter | undefined {
  const location = mapParamLocation(metadata.type)
  if (!location) {
    return undefined
  }

  const name = resolveParameterName(metadata, routePath)
  const schema = buildSchema(metadata.metatype, schemas)

  return {
    name,
    in: location,
    required: location === 'path' ? true : undefined,
    schema,
  }
}

function mapParamLocation(paramType: RouteParamtypes): OpenApiParameter['in'] | undefined {
  switch (paramType) {
    case RouteParamtypes.PARAM: {
      return 'path'
    }
    case RouteParamtypes.QUERY: {
      return 'query'
    }
    case RouteParamtypes.HEADERS: {
      return 'header'
    }
    default: {
      return undefined
    }
  }
}

function resolveParameterName(metadata: RouteParamMetadataItem, routePath: string): string {
  if (metadata.data && metadata.data.length > 0) {
    return metadata.data
  }

  if (metadata.type === RouteParamtypes.PARAM) {
    const matches = [...routePath.matchAll(/:(\w+)/g)]
    const match = matches[metadata.index]
    if (match && match[1]) {
      return match[1]
    }
  }

  return `arg${metadata.index}`
}

function buildRequestBody(metadata: RouteParamMetadataItem, schemas: Map<Constructor, unknown>): OpenApiRequestBody {
  const schema = buildSchema(metadata.metatype, schemas)
  return {
    required: true,
    content: {
      'application/json': {
        schema: schema ?? { type: 'object' },
      },
    },
  }
}

function buildSchema(metatype: Constructor | undefined, schemas: Map<Constructor, unknown>): unknown {
  const zodSchema = getZodSchema(metatype)
  if (!zodSchema) {
    return inferPrimitiveSchema(metatype)
  }

  if (!metatype) {
    return convertZodSchema(zodSchema).schema
  }

  if (!schemas.has(metatype)) {
    const conversion = convertZodSchema(zodSchema)
    schemas.set(metatype, conversion.schema)
  }

  return { $ref: `#/components/schemas/${getSchemaName(metatype)}` }
}

function inferPrimitiveSchema(metatype: Constructor | undefined): unknown {
  switch (metatype) {
    case String: {
      return { type: 'string' }
    }
    case Number: {
      return { type: 'number' }
    }
    case Boolean: {
      return { type: 'boolean' }
    }
    default: {
      return { type: 'string' }
    }
  }
}

function getSchemaName(constructor: Constructor): string {
  return constructor.name && constructor.name.length > 0 ? constructor.name : 'AnonymousSchema'
}

function convertZodSchema(schema: ZodTypeAny): SchemaConversionResult {
  const { inner, optional, nullable } = unwrapSchema(schema)
  const converted = mapZodType(inner)

  if (nullable && typeof converted.schema === 'object' && converted.schema !== null) {
    ;(converted.schema as Record<string, unknown>).nullable = true
  }

  return {
    schema: converted.schema,
    optional: converted.optional || optional,
  }
}

function getDefinition(schema: ZodTypeAny): Record<string, any> {
  if (!schema) {
    return {}
  }

  const direct = Reflect.get(schema as object, '_def')
  if (direct && typeof direct === 'object') {
    return direct as Record<string, any>
  }

  const internal = Reflect.get(schema as object, '_zod')
  if (internal && typeof internal === 'object') {
    const nested = Reflect.get(internal, 'def')
    if (nested && typeof nested === 'object') {
      return nested as Record<string, any>
    }
  }

  return {}
}

function getTypeName(schema: ZodTypeAny): string | undefined {
  const def = getDefinition(schema)
  return def.typeName ?? def.type ?? schema.constructor?.name
}

function getInnerSchemaFromDef(def: Record<string, any>): ZodTypeAny | undefined {
  if (!def || typeof def !== 'object') {
    return undefined
  }

  return (def.innerType ??
    def.schema ??
    def.base ??
    def.source ??
    def.type ??
    def.target ??
    def.valueType ??
    def.element ??
    def.rest ??
    def.catchall ??
    def.shape ??
    def.output) as ZodTypeAny | undefined
}

function getInnerSchema(schema: ZodTypeAny): ZodTypeAny | undefined {
  const def = getDefinition(schema)
  const inner = getInnerSchemaFromDef(def)
  if (inner) {
    return inner
  }

  if (typeof (schema as any).unwrap === 'function') {
    return (schema as any).unwrap()
  }

  return undefined
}

function unwrapSchema(schema: ZodTypeAny): { inner: ZodTypeAny; optional: boolean; nullable: boolean } {
  let current = schema
  let optional = false
  let nullable = false

  // unwrap optional/nullable/default/effect-like wrappers
  while (true) {
    const typeName = getTypeName(current)

    if (typeName && OPTIONAL_WRAPPER_TYPES.has(typeName)) {
      optional = true
    }

    if (typeName && NULLABLE_WRAPPER_TYPES.has(typeName)) {
      nullable = true
    }

    if (
      !typeName ||
      (!OPTIONAL_WRAPPER_TYPES.has(typeName) &&
        !NULLABLE_WRAPPER_TYPES.has(typeName) &&
        !PASSTHROUGH_WRAPPER_TYPES.has(typeName))
    ) {
      break
    }

    const next = getInnerSchema(current)
    if (!next || next === current) {
      break
    }

    current = next
  }

  return { inner: current, optional, nullable }
}

function mapZodType(schema: ZodTypeAny): SchemaConversionResult {
  const typeName = getTypeName(schema)

  if (schema instanceof ZodString) {
    return {
      schema: buildStringSchema(schema),
      optional: false,
    }
  }

  if (schema instanceof ZodNumber) {
    return {
      schema: buildNumberSchema(schema),
      optional: false,
    }
  }

  if (schema instanceof ZodBoolean) {
    return {
      schema: { type: 'boolean' },
      optional: false,
    }
  }

  if (schema instanceof ZodArray) {
    const elementSchema: ZodTypeAny | undefined =
      (schema as any).element ??
      (typeof (schema as any).unwrap === 'function' ? (schema as any).unwrap() : undefined) ??
      getInnerSchemaFromDef(getDefinition(schema)) ??
      getDefinition(schema).type

    const element = elementSchema
      ? convertZodSchema(elementSchema as ZodTypeAny)
      : { schema: { type: 'string' }, optional: false }
    return {
      schema: {
        type: 'array',
        items: element.schema,
      },
      optional: false,
    }
  }

  if (schema instanceof ZodObject) {
    return {
      schema: buildObjectSchema(schema),
      optional: false,
    }
  }

  if (schema instanceof ZodUnion) {
    const unionOptions = ((schema as any).options ?? getDefinition(schema).options ?? []) as ZodTypeAny[]
    const options = unionOptions.map((option) => convertZodSchema(option as ZodTypeAny).schema)
    return {
      schema: { oneOf: options },
      optional: false,
    }
  }

  if (schema instanceof ZodEnum) {
    const values = (schema as any).options ?? getDefinition(schema).values ?? []
    return {
      schema: { type: typeof values[0] === 'number' ? 'number' : 'string', enum: values },
      optional: false,
    }
  }

  if (typeName === 'ZodNativeEnum') {
    const values = Object.values(getDefinition(schema).values ?? {})
    return {
      schema: { type: typeof values[0] === 'number' ? 'number' : 'string', enum: values },
      optional: false,
    }
  }

  if (schema instanceof ZodLiteral) {
    const { value } = getDefinition(schema)
    const type = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string'
    return {
      schema: { type, enum: [value] },
      optional: false,
    }
  }

  if (schema instanceof ZodRecord) {
    const valueSchema = ((schema as any).valueSchema ?? getDefinition(schema).valueType) as ZodTypeAny | undefined
    const valueType = valueSchema ? convertZodSchema(valueSchema).schema : { type: 'string' }
    return {
      schema: {
        type: 'object',
        additionalProperties: valueType,
      },
      optional: false,
    }
  }

  return {
    schema: { type: 'string' },
    optional: false,
  }
}

function buildStringSchema(schema: ZodString): Record<string, unknown> {
  const jsonSchema: Record<string, unknown> = { type: 'string' }

  const def = getDefinition(schema)
  const checks: Array<{ kind: string; value?: unknown }> = def.checks ?? []

  for (const check of checks) {
    switch (check.kind) {
      case 'min': {
        jsonSchema.minLength = check.value
        break
      }
      case 'max': {
        jsonSchema.maxLength = check.value
        break
      }
      case 'length': {
        jsonSchema.minLength = check.value
        jsonSchema.maxLength = check.value
        break
      }
      case 'email': {
        jsonSchema.format = 'email'
        break
      }
      case 'uuid': {
        jsonSchema.format = 'uuid'
        break
      }
      case 'url': {
        jsonSchema.format = 'uri'
        break
      }
      default: {
        break
      }
    }
  }

  return jsonSchema
}

function buildNumberSchema(schema: ZodNumber): Record<string, unknown> {
  const jsonSchema: Record<string, unknown> = { type: 'number' }

  const def = getDefinition(schema)
  const checks: Array<{ kind: string; value?: number; inclusive?: boolean }> = def.checks ?? []

  for (const check of checks) {
    switch (check.kind) {
      case 'min': {
        if (check.inclusive === false) {
          jsonSchema.exclusiveMinimum = check.value
        } else {
          jsonSchema.minimum = check.value
        }
        break
      }
      case 'max': {
        if (check.inclusive === false) {
          jsonSchema.exclusiveMaximum = check.value
        } else {
          jsonSchema.maximum = check.value
        }
        break
      }
      case 'int': {
        jsonSchema.type = 'integer'
        break
      }
      default: {
        break
      }
    }
  }

  return jsonSchema
}

function buildObjectSchema(schema: ZodObject<any>): Record<string, unknown> {
  const def = getDefinition(schema)
  const shapeFactory = def.shape
  const shape =
    typeof (schema as any).shape === 'function'
      ? (schema as any).shape()
      : ((schema as any).shape ?? (typeof shapeFactory === 'function' ? shapeFactory() : (shapeFactory ?? {})))
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape as Record<string, ZodTypeAny>)) {
    const converted = convertZodSchema(value as ZodTypeAny)
    properties[key] = converted.schema
    if (!converted.optional) {
      required.push(key)
    }
  }

  const result: Record<string, unknown> = {
    type: 'object',
    properties,
  }

  if (required.length > 0) {
    result.required = required
  }

  const { catchall } = def
  if (catchall && !(catchall instanceof ZodNever)) {
    result.additionalProperties = convertZodSchema(catchall as ZodTypeAny).schema
  }

  return result
}

function dedupeTags(tags: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const tag of tags) {
    if (!tag || seen.has(tag)) {
      continue
    }
    seen.add(tag)
    result.push(tag)
  }
  return result
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
  let value = map.get(key)
  if (!value) {
    value = factory()
    map.set(key, value)
  }
  return value
}

function buildModuleDocumentTree(
  node: ModuleNode,
  parentPath: string[],
  modules: Map<string, Map<string, ModuleControllerNode>>,
  ancestors = new Set<Constructor>(),
): ModuleDocumentNode {
  const path = [...parentPath, node.label]
  const moduleKey = path.join('::')
  const controllersMap = modules.get(moduleKey) ?? new Map<string, ModuleControllerNode>()
  const controllers = [...controllersMap.values()].map((controller) => ({
    name: controller.name,
    routes: controller.routes,
  }))

  const nextAncestors = new Set(ancestors)
  nextAncestors.add(node.module)

  const children: ModuleDocumentNode[] = []
  for (const child of node.children) {
    if (nextAncestors.has(child.module)) {
      children.push({
        name: child.label,
        path: [...path, child.label],
        controllers: [],
        children: [],
      })
      continue
    }

    children.push(buildModuleDocumentTree(child, path, modules, nextAncestors))
  }

  return {
    name: node.label,
    path,
    controllers,
    children,
  }
}
