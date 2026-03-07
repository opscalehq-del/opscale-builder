import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { initDb } from './lib/db.js';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { fileRoutes } from './routes/files.js';
import { agentRoutes } from './routes/agents.js';
import { runRoutes } from './routes/runs.js';
import { startRunWorker } from './services/run-engine.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  initDb();

  app.register(cors, { origin: true, credentials: true });
  app.register(sensible);
  app.register(jwt, { secret: env.JWT_SECRET });
  app.register(swagger, {
    openapi: {
      info: {
        title: 'Orchids Builder Backend API',
        version: '1.0.0'
      }
    }
  });
  app.register(swaggerUi, { routePrefix: '/docs' });

  app.register(authPlugin);

  app.get('/health', async () => ({ ok: true, service: 'orchids-builder-backend' }));
  app.register(authRoutes, { prefix: '/v1' });
  app.register(projectRoutes, { prefix: '/v1' });
  app.register(fileRoutes, { prefix: '/v1' });
  app.register(agentRoutes, { prefix: '/v1' });
  app.register(runRoutes, { prefix: '/v1' });

  startRunWorker();

  return app;
}
