# Hono Enterprise Template

A NestJS‑inspired, Hono‑powered enterprise template for building modular, type‑safe HTTP services. The core framework package ships with dependency injection, decorators, guards, pipes, interceptors, exception filters, request‑scoped context, and an extensible pretty logger. The framework tests achieve 100% coverage and the sample app demonstrates all enhancement paths end‑to‑end.

## ✨ Features

- **Hono application layer**: Hono performance with opinionated structure and decorators.
- **Modular architecture + DI**: `tsyringe`-based container, constructor injection, module imports/exports.
- **Request context**: `HttpContext` built on `AsyncLocalStorage` to safely access the current `Context` anywhere.
- **Composables (enhancers)**: Guards, Pipes, Interceptors, and Exception Filters with a declarative API.
- **Zod validation pipe**: `createZodValidationPipe(schema)` for concise, strongly typed payload validation.
- **Pretty logger**: Namespaced, colorized output with CI-safe text labels and hierarchical `extend()`.
- **First-class testing**: Framework Vitest suite with 100% coverage; demo app covers all enhancer paths.

## 📁 Monorepo Layout

| Path                       | Description                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/core`                | Demo application showcasing modules, controllers, and all enhancers; usable as a starter |
| `packages/framework`       | Core framework: `HonoHttpApplication`, decorators, HTTP context, logger, Zod pipe, etc.  |
| `packages/framework/tests` | Vitest suite for the framework with coverage and lifecycle tests                         |

## ✅ Requirements

- Node.js 18+ (uses `AsyncLocalStorage` and modern ESM tooling)
- pnpm 10+
- TypeScript 5.9

## 🚀 Quickstart

```bash
# install dependencies
pnpm install

# run framework tests (with coverage)
pnpm -C packages/framework test

# run demo app tests
pnpm -C apps/core test

# start the demo app (vite-node)
pnpm -C apps/core dev

# or run the in-process demo runner
pnpm -C apps/core demo
```

Coverage reports are generated at `packages/framework/coverage`.

## 🧱 Architecture & Runtime Model

### 1) Modules and Controllers

```ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Module,
} from '@hono-template/framework'

@Controller('demo')
export class DemoController {
  constructor(private readonly service: DemoService) {}

  @Get('/hello')
  @UseGuards(ApiKeyGuard)
  async greet(@Query('name') name: string) {
    return this.service.greet(name)
  }
}

@Module({
  controllers: [DemoController],
  providers: [DemoService, ApiKeyGuard],
})
export class DemoModule {}
```

Bootstrapping with `createApplication(RootModule, options)` performs:

1. Recursive module registration via `imports`.
2. DI registration of `providers` and `controllers` using `tsyringe`.
3. Route discovery from class/method decorators and mapping to Hono.
4. Per-request pipeline: Guards → Pipes (global/method/parameter) → Interceptors → Controller → Filters.

### 2) Enhancers (Guards, Pipes, Interceptors, Filters)

- `@UseGuards(...guards)`: `CanActivate.canActivate(ctx)` returning `boolean | Promise<boolean>`. `false` throws `ForbiddenException`.
- `@UsePipes(...pipes)` and parameter-level pipes (e.g., `@Param('id', ParseIntPipe)`): merged globally and per-method.
- `@UseInterceptors(...interceptors)`: `interceptor.intercept(context, next)` chaining.
- `@UseFilters(...filters)`: handle and customize error responses; unhandled errors return a 500 JSON payload.

Zod validation is provided via `createZodValidationPipe(schema)`. See `packages/framework/tests/application.spec.ts` for full examples.

### 3) Result Handling

Handlers may return `Response`, `string`, `ArrayBuffer`, `ArrayBufferView`, `ReadableStream`, or plain objects. Non-`Response` values are normalized to a proper HTTP response. `undefined` or returning `context.res` preserves the current response.

### 4) Logger

```ts
import { createLogger } from '@hono-template/framework'

const logger = createLogger('App')
logger.info('Service started')
logger.warn('Auth failed', { userId })

const scoped = logger.extend('Module')
scoped.debug('Loaded')
```

Logger options include custom writer, color strategy, clock, per-level colors, and CI-safe text labels. The framework uses namespaces `Framework`, `Framework:DI`, and `Framework:Router` internally.

### 5) Request Context

`HttpContext.run(context, fn)` establishes a request scope; call `HttpContext.get()` to access the current Hono `Context` from services, guards, or interceptors. You may replace the active context with `HttpContext.setContext()` if needed.

## 🧪 Testing & Quality

- Framework tests: `pnpm -C packages/framework test` (coverage threshold 100%).
- Demo app tests: `pnpm -C apps/core test`.
- Type checking: use TypeScript 5.9; optionally run `pnpm tsc --noEmit` at the repo root.

## 🧩 Developer Guide

### Bootstrapping an App

```ts
import 'reflect-metadata'
import { serve } from '@hono/node-server'
import { createApplication } from '@hono-template/framework'
import { AppModule } from './app.module'

const app = await createApplication(AppModule, { globalPrefix: '/api' })
const hono = app.getInstance()

serve({ fetch: hono.fetch, port: 3000 })
```

You can also register global enhancers:

```ts
app.useGlobalFilters(AllExceptionsFilter)
app.useGlobalInterceptors(LoggingInterceptor)
app.useGlobalPipes(ValidationPipe)
```

### Dependency Injection & Types

Use `tsyringe` decorators for providers and constructor injection:

```ts
import { injectable, inject } from 'tsyringe'
import { Controller, Get } from '@hono-template/framework'

@injectable()
class AppService {
  getHello(echo?: string | null): {
    message: string
    timestamp: string
    echo?: string | null
  } {
    return {
      message: 'Hello',
      timestamp: new Date().toISOString(),
      echo: echo ?? undefined,
    }
  }
}

@Controller('app')
@injectable()
class AppController {
  constructor(@inject(AppService) private readonly service: AppService) {}

  @Get('/')
  getRoot() {
    return this.service.getHello()
  }
}
```

### Parameter Decorators

`@Body`, `@Query`, `@Param`, `@Headers`, `@Req`, `@ContextParam` extract values and optionally run per-parameter pipes.

### Exceptions

Throw `HttpException` or built-ins like `BadRequestException`, `ForbiddenException`, `NotFoundException`. Custom filters may translate errors into consistent API responses.

### Validation with Zod

```ts
import { z } from 'zod'
import {
  createZodValidationPipe,
  Body,
  Post,
  Controller,
} from '@hono-template/framework'

const CreateMessageSchema = z.object({
  message: z.string().min(1),
  tags: z.array(z.string()).default([]),
})

type CreateMessageInput = z.infer<typeof CreateMessageSchema>
const CreateMessagePipe =
  createZodValidationPipe<CreateMessageInput>(CreateMessageSchema)

@Controller('messages')
class MessagesController {
  @Post('/:id')
  create(@Body(undefined, CreateMessagePipe) body: CreateMessageInput) {
    return { status: 'queued', ...body }
  }
}
```

## 📜 Scripts

In `apps/core/package.json`:

- `dev`: start the demo server with vite-node.
- `demo`: run an in-process demo exercising routes and enhancers.
- `test`: run tests for the demo app.

## 🔗 References & Inspiration

- [NestJS](https://nestjs.com/) — decorator-driven, layered application architecture.
- [Hono](https://hono.dev/) — small, fast web framework.
- [tsyringe](https://github.com/microsoft/tsyringe) — lightweight dependency injection container.
- [Zod](https://zod.dev/) — type-safe schema validation.

---

Customize the framework under `packages/framework/src` and use `apps/core` as a reference implementation for modules, controllers, and enhancers. Consider extending with enterprise capabilities (configuration, CQRS, event bus, etc.) as your project evolves.
