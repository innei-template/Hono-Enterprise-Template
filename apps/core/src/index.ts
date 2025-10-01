import 'reflect-metadata';
import { serve } from '@hono/node-server';
import { createConfiguredApp } from './app.factory';

const bootstrap = async () => {
  const app = await createConfiguredApp({
    globalPrefix: '/api',
  });

  const hono = app.getInstance();
  const port = Number(process.env.PORT ?? 3000);

  console.info(`Starting Hono HTTP application on port ${port}`);

  serve({
    fetch: hono.fetch,
    port,
  });
};

bootstrap().catch((error) => {
  console.error('Application bootstrap failed', error);
  process.exit(1);
});
