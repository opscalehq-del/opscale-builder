import { customAlphabet } from 'nanoid';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { nowIso } from '../lib/utils.js';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

const UpsertFileSchema = z.object({
  path: z.string().min(1).max(255),
  content: z.string()
});

function assertProjectOwnership(projectId: string, userId: string): boolean {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  return !!project;
}

export async function fileRoutes(app: FastifyInstance) {
  app.get('/projects/:projectId/files', { preHandler: app.authenticate }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const userId = (req.user as { sub: string }).sub;
    if (!assertProjectOwnership(projectId, userId)) return reply.notFound('Project not found');

    const files = db
      .prepare('SELECT id, path, created_at, updated_at FROM project_files WHERE project_id = ? ORDER BY path ASC')
      .all(projectId);
    return { files };
  });

  app.get('/projects/:projectId/files/*', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId } = req.params as { projectId: string };
    const relPath = (req.params as { '*': string })['*'];
    if (!assertProjectOwnership(projectId, userId)) return reply.notFound('Project not found');

    const file = db
      .prepare('SELECT * FROM project_files WHERE project_id = ? AND path = ?')
      .get(projectId, relPath);
    if (!file) return reply.notFound('File not found');

    return { file };
  });

  app.put('/projects/:projectId/files', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId } = req.params as { projectId: string };
    if (!assertProjectOwnership(projectId, userId)) return reply.notFound('Project not found');

    const parsed = UpsertFileSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });

    const now = nowIso();
    const existing = db
      .prepare('SELECT id FROM project_files WHERE project_id = ? AND path = ?')
      .get(projectId, parsed.data.path) as { id: string } | undefined;

    if (existing) {
      db.prepare('UPDATE project_files SET content = ?, updated_at = ? WHERE id = ?')
        .run(parsed.data.content, now, existing.id);
      const file = db.prepare('SELECT * FROM project_files WHERE id = ?').get(existing.id);
      return { file };
    }

    const fileId = nanoid();
    db.prepare(
      'INSERT INTO project_files (id, project_id, path, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(fileId, projectId, parsed.data.path, parsed.data.content, now, now);

    const file = db.prepare('SELECT * FROM project_files WHERE id = ?').get(fileId);
    return reply.code(201).send({ file });
  });

  app.delete('/projects/:projectId/files/*', { preHandler: app.authenticate }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { projectId } = req.params as { projectId: string };
    const relPath = (req.params as { '*': string })['*'];
    if (!assertProjectOwnership(projectId, userId)) return reply.notFound('Project not found');

    const result = db.prepare('DELETE FROM project_files WHERE project_id = ? AND path = ?').run(projectId, relPath);
    if (!result.changes) return reply.notFound('File not found');
    return reply.code(204).send();
  });
}
