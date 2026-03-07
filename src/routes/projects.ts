import { customAlphabet } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { nowIso } from '../lib/utils.js';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

const CreateProjectSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().nullable()
});

const UpdateProjectSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional().nullable()
});

function getProjectForUser(projectId: string, userId: string) {
  return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
}

export async function projectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: app.authenticate }, async (req) => {
    const userId = (req.user as { sub: string }).sub;
    const projects = db
      .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId);
    return { projects };
  });

  app.post('/projects', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    const userId = (req.user as { sub: string }).sub;

    const now = nowIso();
    const project = {
      id: nanoid(),
      user_id: userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      created_at: now,
      updated_at: now
    };

    db.prepare(
      'INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(project.id, project.user_id, project.name, project.description, project.created_at, project.updated_at);

    return reply.code(201).send({ project });
  });

  app.get('/projects/:projectId', { preHandler: app.authenticate }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const userId = (req.user as { sub: string }).sub;
    const project = getProjectForUser(projectId, userId);
    if (!project) return reply.notFound('Project not found');
    return { project };
  });

  app.patch('/projects/:projectId', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = UpdateProjectSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });

    const { projectId } = req.params as { projectId: string };
    const userId = (req.user as { sub: string }).sub;
    const current = getProjectForUser(projectId, userId) as { name: string; description: string | null } | undefined;
    if (!current) return reply.notFound('Project not found');

    const next = {
      name: parsed.data.name ?? current.name,
      description: parsed.data.description === undefined ? current.description : parsed.data.description,
      updated_at: nowIso()
    };

    db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(next.name, next.description, next.updated_at, projectId, userId);

    const updated = getProjectForUser(projectId, userId);
    return { project: updated };
  });

  app.delete('/projects/:projectId', { preHandler: app.authenticate }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const userId = (req.user as { sub: string }).sub;
    const result = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(projectId, userId);
    if (!result.changes) return reply.notFound('Project not found');
    return reply.code(204).send();
  });
}
